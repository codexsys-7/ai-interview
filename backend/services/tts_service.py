# backend/services/tts_service.py
"""
Text-to-Speech Service for AI Interview Simulator

Converts AI interviewer text to natural speech audio using OpenAI's TTS API.
Provides high-quality, contextually-aware voice generation for a professional
interview experience.

Features:
- OpenAI TTS integration (tts-1 and tts-1-hd models)
- Emotion-aware speech generation
- Interview context optimization
- Audio caching to reduce API calls
- Batch generation support
"""

import os
import logging
import hashlib
import asyncio
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from uuid import uuid4
from datetime import datetime, timezone

from openai import AsyncOpenAI

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TTSService:
    """
    Text-to-Speech service using OpenAI's TTS API.

    Converts text to natural-sounding speech with support for:
    - Multiple voices (alloy, echo, fable, onyx, nova, shimmer)
    - Speed adjustment (0.25 to 4.0)
    - Multiple output formats (mp3, opus, aac, flac)
    - Emotion-aware generation
    - Interview context optimization
    - Caching for efficiency
    """

    # OpenAI TTS voice options
    VOICES = {
        "alloy": "Neutral, professional, versatile (default)",
        "echo": "Clear, measured, authoritative",
        "fable": "Warm, expressive, engaging",
        "onyx": "Deep, serious, thoughtful",
        "nova": "Bright, friendly, encouraging",
        "shimmer": "Energetic, enthusiastic, dynamic"
    }

    # TTS models
    MODEL_STANDARD = "tts-1"  # Faster, good quality
    MODEL_HD = "tts-1-hd"  # Slower, best quality

    # Supported output formats
    FORMATS = ["mp3", "opus", "aac", "flac"]

    # Max text length for TTS API
    MAX_TEXT_LENGTH = 4096

    # Speed limits
    MIN_SPEED = 0.25
    MAX_SPEED = 4.0

    # Emotion to voice/speed mapping
    EMOTION_MAPPING = {
        "neutral": {"voice": "alloy", "speed": 1.0},
        "encouraging": {"voice": "nova", "speed": 0.95},
        "curious": {"voice": "echo", "speed": 1.05},
        "concerned": {"voice": "onyx", "speed": 0.9},
        "enthusiastic": {"voice": "shimmer", "speed": 1.1},
        "warm": {"voice": "fable", "speed": 0.95},
        "professional": {"voice": "alloy", "speed": 0.95},
        "thoughtful": {"voice": "onyx", "speed": 0.9}
    }

    # Context type to voice/speed mapping
    CONTEXT_MAPPING = {
        "question": {"voice": "alloy", "speed": 0.95, "model": MODEL_STANDARD},
        "acknowledgment": {"voice": "nova", "speed": 1.0, "model": MODEL_STANDARD},
        "follow_up": {"voice": "echo", "speed": 1.05, "model": MODEL_STANDARD},
        "challenge": {"voice": "onyx", "speed": 0.9, "model": MODEL_STANDARD},
        "encouragement": {"voice": "nova", "speed": 1.05, "model": MODEL_STANDARD},
        "transition": {"voice": "alloy", "speed": 1.0, "model": MODEL_STANDARD},
        "probe": {"voice": "echo", "speed": 0.95, "model": MODEL_STANDARD}
    }

    # Stage adjustments (multipliers for speed)
    STAGE_ADJUSTMENTS = {
        "early": 0.95,  # Slightly slower, more formal
        "mid": 1.0,  # Normal
        "late": 1.02  # Slightly faster, more familiar
    }

    def __init__(
        self,
        api_key: Optional[str] = None,
        cache_dir: str = "audio_cache",
        max_cache_files: int = 500,
        use_hd_model: bool = False
    ):
        """
        Initialize the TTS Service.

        Args:
            api_key: OpenAI API key (uses env var if not provided)
            cache_dir: Directory for caching audio files
            max_cache_files: Maximum number of cached files to keep
            use_hd_model: Use tts-1-hd for higher quality (slower)
        """
        # Initialize OpenAI client
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            logger.warning("No OpenAI API key found - TTS will not work")

        self.client = AsyncOpenAI(api_key=self.api_key)

        # Setup cache directory
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Configuration
        self.max_cache_files = max_cache_files
        self.default_model = self.MODEL_HD if use_hd_model else self.MODEL_STANDARD

        # In-memory cache index for fast lookups
        self._cache_index: Dict[str, str] = {}
        self._load_cache_index()

        logger.info(f"TTSService initialized with cache at {self.cache_dir}")
        logger.info(f"Using model: {self.default_model}")

    def _load_cache_index(self):
        """Load existing cache files into memory index."""
        try:
            for file_path in self.cache_dir.glob("*.mp3"):
                # Extract cache key from filename (format: key_uuid.mp3)
                parts = file_path.stem.rsplit("_", 1)
                if len(parts) == 2:
                    cache_key = parts[0]
                    self._cache_index[cache_key] = str(file_path)

            logger.info(f"Loaded {len(self._cache_index)} cached audio files")
        except Exception as e:
            logger.error(f"Error loading cache index: {e}")

    async def generate_speech(
        self,
        text: str,
        voice: str = "alloy",
        speed: float = 1.0,
        output_format: str = "mp3",
        model: Optional[str] = None
    ) -> bytes:
        """
        Convert text to speech using OpenAI TTS API.

        Args:
            text: The text to convert to speech
            voice: OpenAI voice option (alloy, echo, fable, onyx, nova, shimmer)
            speed: Speech rate (0.25 to 4.0), default 1.0
            output_format: Output format (mp3, opus, aac, flac)
            model: TTS model to use (tts-1 or tts-1-hd)

        Returns:
            Audio bytes in specified format

        Raises:
            ValueError: If text is too long or parameters are invalid
            Exception: If TTS API call fails
        """
        # Validate inputs
        if not text or not text.strip():
            logger.warning("Empty text provided to TTS")
            raise ValueError("Text cannot be empty")

        if len(text) > self.MAX_TEXT_LENGTH:
            logger.warning(f"Text too long ({len(text)} chars), truncating")
            text = text[:self.MAX_TEXT_LENGTH]

        if voice not in self.VOICES:
            logger.warning(f"Unknown voice '{voice}', using 'alloy'")
            voice = "alloy"

        if output_format not in self.FORMATS:
            logger.warning(f"Unknown format '{output_format}', using 'mp3'")
            output_format = "mp3"

        # Clamp speed to valid range
        speed = max(self.MIN_SPEED, min(self.MAX_SPEED, speed))

        # Select model
        tts_model = model or self.default_model

        logger.info(f"Generating TTS: voice={voice}, speed={speed}, format={output_format}")
        logger.debug(f"Text ({len(text)} chars): {text[:100]}...")

        try:
            # Call OpenAI TTS API
            response = await self.client.audio.speech.create(
                model=tts_model,
                voice=voice,
                input=text,
                speed=speed,
                response_format=output_format
            )

            # Get audio bytes
            audio_bytes = response.content

            logger.info(f"TTS generated successfully: {len(audio_bytes)} bytes")
            return audio_bytes

        except Exception as e:
            logger.error(f"TTS generation failed: {str(e)}")
            raise

    async def generate_with_emotion(
        self,
        text: str,
        emotion: str = "neutral",
        voice: Optional[str] = None
    ) -> bytes:
        """
        Generate speech with emotional tone.

        OpenAI TTS doesn't have direct emotion control, so we achieve it through:
        1. Voice selection (different voices suit different tones)
        2. Speed adjustments
        3. Text modifications (add emphasis, pauses)

        Args:
            text: Text to convert
            emotion: Emotion type (neutral, encouraging, curious, concerned, enthusiastic)
            voice: Override voice selection (optional)

        Returns:
            Audio bytes with appropriate emotional tone
        """
        logger.info(f"Generating emotional TTS: emotion={emotion}")

        # Get emotion mapping
        emotion_config = self.EMOTION_MAPPING.get(
            emotion,
            self.EMOTION_MAPPING["neutral"]
        )

        # Use provided voice or emotion-based selection
        selected_voice = voice or emotion_config["voice"]
        selected_speed = emotion_config["speed"]

        # Adjust text for emotion
        adjusted_text = self._adjust_text_for_speech(text, emotion)

        # Generate speech
        return await self.generate_speech(
            text=adjusted_text,
            voice=selected_voice,
            speed=selected_speed
        )

    async def generate_for_interview_context(
        self,
        text: str,
        context_type: str,
        conversation_stage: str = "mid"
    ) -> bytes:
        """
        Generate speech optimized for interview context.

        Args:
            text: Text to speak
            context_type: Type of content (question, acknowledgment, follow_up, etc.)
            conversation_stage: Interview stage (early, mid, late)

        Returns:
            Contextually-optimized audio bytes
        """
        logger.info(f"Generating interview TTS: context={context_type}, stage={conversation_stage}")

        # Get context configuration
        context_config = self.CONTEXT_MAPPING.get(
            context_type,
            self.CONTEXT_MAPPING["question"]
        )

        # Get stage adjustment
        stage_multiplier = self.STAGE_ADJUSTMENTS.get(conversation_stage, 1.0)

        # Calculate final speed
        base_speed = context_config["speed"]
        final_speed = base_speed * stage_multiplier

        # Clamp to valid range
        final_speed = max(self.MIN_SPEED, min(self.MAX_SPEED, final_speed))

        # Get voice and model
        voice = context_config["voice"]
        model = context_config.get("model", self.default_model)

        # Adjust text based on context
        emotion = self._get_emotion_for_context(context_type)
        adjusted_text = self._adjust_text_for_speech(text, emotion)

        logger.info(f"Interview TTS params: voice={voice}, speed={final_speed:.2f}")

        return await self.generate_speech(
            text=adjusted_text,
            voice=voice,
            speed=final_speed,
            model=model
        )

    async def save_audio_file(
        self,
        audio_bytes: bytes,
        filename: str,
        output_dir: Optional[str] = None
    ) -> str:
        """
        Save audio bytes to file and return path.

        Args:
            audio_bytes: Audio data from TTS
            filename: Desired filename (without extension)
            output_dir: Directory to save audio (uses cache_dir if not specified)

        Returns:
            Full file path to saved audio
        """
        # Determine output directory
        save_dir = Path(output_dir) if output_dir else self.cache_dir
        save_dir.mkdir(parents=True, exist_ok=True)

        # Generate unique filename
        unique_id = str(uuid4())[:8]
        safe_filename = self._sanitize_filename(filename)
        full_filename = f"{safe_filename}_{unique_id}.mp3"
        file_path = save_dir / full_filename

        try:
            # Write audio bytes to file
            with open(file_path, "wb") as f:
                f.write(audio_bytes)

            logger.info(f"Audio saved: {file_path}")
            return str(file_path)

        except Exception as e:
            logger.error(f"Failed to save audio file: {e}")
            raise

    async def generate_and_cache(
        self,
        text: str,
        cache_key: str,
        **kwargs
    ) -> Tuple[bytes, str]:
        """
        Generate speech with caching to avoid repeated API calls.

        Args:
            text: Text to convert
            cache_key: Unique identifier for caching
            **kwargs: Additional args for generate_speech()

        Returns:
            Tuple of (audio_bytes, file_path)
        """
        # Generate cache hash from text + params
        cache_hash = self._generate_cache_hash(text, cache_key, kwargs)

        # Check if cached
        if cache_hash in self._cache_index:
            cached_path = self._cache_index[cache_hash]
            if Path(cached_path).exists():
                logger.info(f"Cache hit for key: {cache_key}")
                with open(cached_path, "rb") as f:
                    return f.read(), cached_path

        # Cache miss - generate new audio
        logger.info(f"Cache miss for key: {cache_key}, generating...")

        # Generate speech
        audio_bytes = await self.generate_speech(text, **kwargs)

        # Save to cache
        file_path = await self.save_audio_file(audio_bytes, cache_hash)

        # Update cache index
        self._cache_index[cache_hash] = file_path

        # Clean up old cache files if needed
        await self._cleanup_cache()

        return audio_bytes, file_path

    def should_speak_this(
        self,
        text: str,
        context: str = "general"
    ) -> bool:
        """
        Decide if text should be spoken aloud.

        Args:
            text: The text to evaluate
            context: Content type (question, response, system_message, error)

        Returns:
            True if should generate audio, False otherwise
        """
        # Never speak if no text
        if not text or not text.strip():
            return False

        # Context-based rules
        always_speak_contexts = ["question", "response", "acknowledgment", "follow_up"]
        never_speak_contexts = ["system_message", "error", "debug", "log"]

        if context in never_speak_contexts:
            logger.debug(f"Not speaking: context is {context}")
            return False

        if context in always_speak_contexts:
            # Check length limit for these contexts
            if len(text) > 500:
                logger.debug(f"Not speaking: text too long ({len(text)} chars)")
                return False
            return True

        # For general context, apply heuristics
        # Don't speak very short text (likely not meaningful)
        if len(text) < 5:
            return False

        # Don't speak very long text
        if len(text) > 500:
            logger.debug("Not speaking: text exceeds 500 characters")
            return False

        # Don't speak if looks like code or technical output
        code_indicators = ["```", "def ", "class ", "import ", "{", "}", "=>"]
        if any(indicator in text for indicator in code_indicators):
            logger.debug("Not speaking: appears to be code")
            return False

        # Default: speak it
        return True

    async def generate_batch(
        self,
        texts: List[Dict[str, str]],
        max_concurrent: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Generate multiple TTS audios concurrently.

        Args:
            texts: List of dicts with format:
                   [{"text": "...", "context": "question", "id": "q1"}, ...]
            max_concurrent: Maximum concurrent API calls

        Returns:
            List of dicts with results:
            [{"id": "q1", "audio_bytes": b"...", "file_path": "...", "success": True}, ...]
        """
        logger.info(f"Batch TTS: {len(texts)} items, max concurrent: {max_concurrent}")

        # Semaphore to limit concurrent requests
        semaphore = asyncio.Semaphore(max_concurrent)

        async def generate_one(item: Dict[str, str]) -> Dict[str, Any]:
            """Generate TTS for a single item with semaphore."""
            async with semaphore:
                item_id = item.get("id", str(uuid4())[:8])
                text = item.get("text", "")
                context = item.get("context", "general")

                try:
                    # Check if should speak
                    if not self.should_speak_this(text, context):
                        return {
                            "id": item_id,
                            "audio_bytes": None,
                            "file_path": None,
                            "success": False,
                            "reason": "should_not_speak"
                        }

                    # Generate audio
                    audio_bytes, file_path = await self.generate_and_cache(
                        text,
                        cache_key=f"batch_{item_id}",
                        voice=self._select_voice_for_context(context)
                    )

                    return {
                        "id": item_id,
                        "audio_bytes": audio_bytes,
                        "file_path": file_path,
                        "success": True
                    }

                except Exception as e:
                    logger.error(f"Batch TTS failed for {item_id}: {e}")
                    return {
                        "id": item_id,
                        "audio_bytes": None,
                        "file_path": None,
                        "success": False,
                        "error": str(e)
                    }

        # Generate all concurrently
        tasks = [generate_one(item) for item in texts]
        results = await asyncio.gather(*tasks)

        successful = sum(1 for r in results if r.get("success"))
        logger.info(f"Batch TTS complete: {successful}/{len(texts)} successful")

        return results

    def _select_voice_for_context(
        self,
        context_type: str,
        emotion: str = "neutral"
    ) -> str:
        """
        Select best voice for given context and emotion.

        Args:
            context_type: Type of content
            emotion: Emotional tone

        Returns:
            Voice name string
        """
        # Check context mapping first
        if context_type in self.CONTEXT_MAPPING:
            return self.CONTEXT_MAPPING[context_type]["voice"]

        # Check emotion mapping
        if emotion in self.EMOTION_MAPPING:
            return self.EMOTION_MAPPING[emotion]["voice"]

        # Default to alloy
        return "alloy"

    def _adjust_text_for_speech(
        self,
        text: str,
        emotion: str = "neutral"
    ) -> str:
        """
        Adjust text for better TTS output.

        Modifications include:
        - Adding natural pauses
        - Breaking long sentences
        - Removing problematic characters

        Args:
            text: Original text
            emotion: Emotional context

        Returns:
            Modified text optimized for TTS
        """
        if not text:
            return text

        adjusted = text

        # Remove problematic characters
        problematic = ["*", "_", "`", "#", "~"]
        for char in problematic:
            adjusted = adjusted.replace(char, "")

        # Add pauses for certain punctuation
        # Replace multiple commas/periods with single
        import re
        adjusted = re.sub(r'\.{2,}', '...', adjusted)
        adjusted = re.sub(r',{2,}', ',', adjusted)

        # Add slight pause after question marks in non-final positions
        adjusted = re.sub(r'\?\s+', '? ... ', adjusted)

        # For curious emotion, emphasize question words
        if emotion == "curious":
            question_words = ["what", "how", "why", "when", "where", "who"]
            for word in question_words:
                # Only replace at word boundaries
                adjusted = re.sub(
                    rf'\b{word}\b',
                    word.upper(),
                    adjusted,
                    count=1,
                    flags=re.IGNORECASE
                )

        # For encouraging emotion, add warmth
        if emotion == "encouraging":
            # Soften periods at end with slight pause
            if adjusted.endswith("."):
                adjusted = adjusted[:-1] + "..."

        # Break very long sentences (>100 chars without punctuation)
        words = adjusted.split()
        result_words = []
        current_length = 0

        for word in words:
            current_length += len(word) + 1
            result_words.append(word)

            # Add pause every ~80 chars if no natural break
            if current_length > 80 and word[-1] not in ".,!?;:":
                result_words.append("...")
                current_length = 0

        adjusted = " ".join(result_words)

        # Clean up multiple spaces
        adjusted = re.sub(r'\s+', ' ', adjusted)

        return adjusted.strip()

    def _get_emotion_for_context(self, context_type: str) -> str:
        """Map context type to emotion."""
        context_emotion_map = {
            "question": "professional",
            "acknowledgment": "warm",
            "follow_up": "curious",
            "challenge": "thoughtful",
            "encouragement": "encouraging",
            "transition": "neutral",
            "probe": "curious"
        }
        return context_emotion_map.get(context_type, "neutral")

    def _generate_cache_hash(
        self,
        text: str,
        cache_key: str,
        params: Dict
    ) -> str:
        """Generate unique hash for caching."""
        # Combine text, key, and relevant params
        voice = params.get("voice", "alloy")
        speed = params.get("speed", 1.0)

        hash_input = f"{cache_key}:{text}:{voice}:{speed}"
        hash_value = hashlib.md5(hash_input.encode()).hexdigest()[:16]

        return f"{self._sanitize_filename(cache_key)}_{hash_value}"

    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for filesystem."""
        # Remove or replace invalid characters
        invalid_chars = '<>:"/\\|?*'
        sanitized = filename

        for char in invalid_chars:
            sanitized = sanitized.replace(char, "_")

        # Limit length
        if len(sanitized) > 50:
            sanitized = sanitized[:50]

        return sanitized

    async def _cleanup_cache(self):
        """Clean up old cache files if exceeding limit."""
        try:
            cache_files = list(self.cache_dir.glob("*.mp3"))

            if len(cache_files) <= self.max_cache_files:
                return

            logger.info(f"Cache cleanup: {len(cache_files)} files exceeds limit {self.max_cache_files}")

            # Sort by modification time (oldest first)
            cache_files.sort(key=lambda f: f.stat().st_mtime)

            # Remove oldest files
            files_to_remove = len(cache_files) - self.max_cache_files
            for file_path in cache_files[:files_to_remove]:
                try:
                    file_path.unlink()

                    # Remove from index
                    for key, path in list(self._cache_index.items()):
                        if path == str(file_path):
                            del self._cache_index[key]
                            break

                except Exception as e:
                    logger.warning(f"Failed to remove cache file {file_path}: {e}")

            logger.info(f"Cache cleanup complete: removed {files_to_remove} files")

        except Exception as e:
            logger.error(f"Cache cleanup error: {e}")

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        cache_files = list(self.cache_dir.glob("*.mp3"))
        total_size = sum(f.stat().st_size for f in cache_files)

        return {
            "cache_dir": str(self.cache_dir),
            "total_files": len(cache_files),
            "index_entries": len(self._cache_index),
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "max_files": self.max_cache_files
        }


# Singleton instance
_tts_service_instance: Optional[TTSService] = None


def get_tts_service() -> TTSService:
    """
    Get or create singleton TTSService instance.

    Returns:
        Shared TTSService instance
    """
    global _tts_service_instance

    if _tts_service_instance is None:
        _tts_service_instance = TTSService()

    return _tts_service_instance


def reset_tts_service():
    """Reset the singleton instance (useful for testing)."""
    global _tts_service_instance
    _tts_service_instance = None
    logger.info("TTSService singleton reset")


# Convenience functions for direct usage

async def generate_speech(
    text: str,
    voice: str = "alloy",
    speed: float = 1.0,
    output_format: str = "mp3"
) -> bytes:
    """
    Convenience function to generate speech.

    Args:
        text: Text to convert
        voice: Voice selection
        speed: Speech rate
        output_format: Audio format

    Returns:
        Audio bytes
    """
    service = get_tts_service()
    return await service.generate_speech(text, voice, speed, output_format)


async def generate_interview_speech(
    text: str,
    context_type: str = "question",
    conversation_stage: str = "mid"
) -> bytes:
    """
    Convenience function for interview-optimized speech.

    Args:
        text: Text to speak
        context_type: Type of content
        conversation_stage: Interview stage

    Returns:
        Audio bytes
    """
    service = get_tts_service()
    return await service.generate_for_interview_context(
        text,
        context_type,
        conversation_stage
    )


async def speak_if_appropriate(
    text: str,
    context: str = "general"
) -> Optional[bytes]:
    """
    Generate speech only if appropriate for the context.

    Args:
        text: Text to potentially speak
        context: Content context

    Returns:
        Audio bytes if should speak, None otherwise
    """
    service = get_tts_service()

    if service.should_speak_this(text, context):
        return await service.generate_speech(text)

    return None
