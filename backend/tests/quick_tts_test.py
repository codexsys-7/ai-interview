# Quick TTS test script - standalone version
import os
import sys
import asyncio
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

# Load environment variables
from dotenv import load_dotenv
env_path = backend_path / ".env"
load_dotenv(dotenv_path=env_path, override=True)

# Direct import to avoid db dependency chain
import logging
import hashlib
from typing import Dict, List, Optional, Tuple, Any
from uuid import uuid4
from openai import AsyncOpenAI

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class QuickTTSTest:
    """Minimal TTS test without full service dependencies."""

    CONTEXT_MAPPING = {
        "question": {"voice": "alloy", "speed": 0.95},
        "acknowledgment": {"voice": "nova", "speed": 1.0},
        "follow_up": {"voice": "echo", "speed": 1.05},
        "challenge": {"voice": "onyx", "speed": 0.9},
        "encouragement": {"voice": "nova", "speed": 1.05},
    }

    STAGE_ADJUSTMENTS = {
        "early": 0.95,
        "mid": 1.0,
        "late": 1.02
    }

    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set in environment")
        self.client = AsyncOpenAI(api_key=api_key)
        self.cache_dir = backend_path / "audio_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        print(f"API Key: {api_key[:8]}...{api_key[-4:]}")

    async def generate_for_interview_context(
        self,
        text: str,
        context_type: str,
        conversation_stage: str = "mid"
    ) -> bytes:
        """Generate speech optimized for interview context."""
        context_config = self.CONTEXT_MAPPING.get(context_type, {"voice": "alloy", "speed": 1.0})
        stage_multiplier = self.STAGE_ADJUSTMENTS.get(conversation_stage, 1.0)

        voice = context_config["voice"]
        speed = context_config["speed"] * stage_multiplier
        speed = max(0.25, min(4.0, speed))

        print(f"Generating with voice={voice}, speed={speed:.2f}")

        response = await self.client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=text,
            speed=speed,
            response_format="mp3"
        )

        return response.content

    async def save_audio_file(self, audio_bytes: bytes, filename: str) -> str:
        """Save audio bytes to file."""
        unique_id = str(uuid4())[:8]
        full_filename = f"{filename}_{unique_id}.mp3"
        file_path = self.cache_dir / full_filename

        with open(file_path, "wb") as f:
            f.write(audio_bytes)

        return str(file_path)


async def main():
    print("=" * 50)
    print("Quick TTS Test")
    print("=" * 50)

    try:
        tts = QuickTTSTest()

        print("\nGenerating speech for: 'Tell me about your experience with Python.'")
        print("Context: question, Stage: early")
        print("...")

        # Generate question audio
        audio = await tts.generate_for_interview_context(
            "Tell me about your experience with Python.",
            context_type="question",
            conversation_stage="early"
        )

        print(f"\nAudio generated: {len(audio):,} bytes")

        # Save to file
        path = await tts.save_audio_file(audio, "question_1")

        print(f"Saved to: {path}")

        # Verify file
        file_path = Path(path)
        if file_path.exists():
            size = file_path.stat().st_size
            print(f"File verified: {size:,} bytes")

            # Check MP3 header
            with open(file_path, "rb") as f:
                header = f.read(3)
            is_valid = header == b"ID3" or (header[0] == 0xFF and (header[1] & 0xE0) == 0xE0)

            if is_valid:
                print("MP3 format: Valid")

            print("\n" + "=" * 50)
            print("SUCCESS! Audio file created.")
            print("=" * 50)
            print(f"\nFile location:\n{file_path.absolute()}")
            print("\nYou can play this file with any audio player.")
        else:
            print("\n❌ FAILED: File not found")

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
