# backend/tests/test_tts_service.py
"""
Pytest test suite for TTS Service.

Run with: pytest tests/test_tts_service.py -v
"""

import os
import sys
import time
import pytest
from pathlib import Path

backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from services.tts_service import (
    TTSService,
    get_tts_service,
    reset_tts_service,
    generate_speech,
    generate_interview_speech,
)

TEST_DIR = backend_path / "audio_cache" / "test_output"


@pytest.fixture(autouse=True)
def ensure_test_dir():
    TEST_DIR.mkdir(parents=True, exist_ok=True)


@pytest.fixture
def tts():
    return get_tts_service()


class TestTTSService:

    @pytest.mark.asyncio
    async def test_simple_speech(self, tts):
        """Generate simple speech and verify bytes are returned."""
        text = "Hello, this is a test of the text to speech service."
        audio_bytes = await tts.generate_speech(text)
        assert audio_bytes and len(audio_bytes) > 0, "Expected non-empty audio bytes"

    @pytest.mark.asyncio
    async def test_save_to_file(self, tts):
        """Generate speech and save to file."""
        text = "This audio will be saved to a file."
        audio_bytes = await tts.generate_speech(text)
        file_path = await tts.save_audio_file(audio_bytes, "test_save", str(TEST_DIR))
        assert file_path and Path(file_path).exists(), "Audio file was not created"

    @pytest.mark.asyncio
    async def test_verify_file_is_valid_mp3(self, tts):
        """Verify saved file exists and has a valid MP3 header."""
        text = "Verifying file creation works correctly."
        audio_bytes = await tts.generate_speech(text)
        file_path = await tts.save_audio_file(audio_bytes, "test_verify", str(TEST_DIR))
        path = Path(file_path)

        assert path.exists(), "File does not exist"
        assert path.stat().st_size >= 1000, f"File too small: {path.stat().st_size} bytes"

        with open(path, "rb") as f:
            header = f.read(3)

        is_valid_mp3 = (
            header == b"ID3"
            or (header[0] == 0xFF and (header[1] & 0xE0) == 0xE0)
        )
        assert is_valid_mp3, f"Invalid MP3 header: {header.hex()}"

    @pytest.mark.asyncio
    async def test_caching(self, tts):
        """Second generation of the same text should be cached (faster or identical)."""
        text = "This text will be cached for efficiency."
        cache_key = "pytest_cache_key"

        start = time.time()
        audio1, path1 = await tts.generate_and_cache(text, cache_key)
        time1 = time.time() - start

        start = time.time()
        audio2, path2 = await tts.generate_and_cache(text, cache_key)
        time2 = time.time() - start

        assert len(audio1) > 0, "First generation returned empty audio"
        assert len(audio2) > 0, "Second (cached) generation returned empty audio"
        # Cache hit: bytes should match OR response should be much faster
        assert audio1 == audio2 or time2 < time1 * 0.5, (
            f"Cache not working: times {time1:.2f}s -> {time2:.2f}s and bytes differ"
        )

    @pytest.mark.asyncio
    async def test_different_voices(self, tts):
        """At least 4 of the 6 OpenAI voices should produce audio."""
        voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
        text = "Testing voice options."
        successes = 0

        for voice in voices:
            try:
                audio = await tts.generate_speech(text, voice=voice)
                if audio and len(audio) > 0:
                    successes += 1
            except Exception:
                pass

        assert successes >= 4, f"Too many voice failures: {successes}/{len(voices)}"

    @pytest.mark.asyncio
    async def test_batch_generation(self, tts):
        """Batch generation should succeed for at least 3 of 4 items."""
        batch_items = [
            {"text": "First question in the batch.", "context": "question", "id": "q1"},
            {"text": "Good answer.", "context": "acknowledgment", "id": "a1"},
            {"text": "Second question here.", "context": "question", "id": "q2"},
            {"text": "Can you elaborate?", "context": "follow_up", "id": "f1"},
        ]
        results = await tts.generate_batch(batch_items, max_concurrent=2)
        successful = sum(1 for r in results if r.get("success"))
        assert successful >= 3, f"Too many batch failures: {successful}/{len(batch_items)}"

    @pytest.mark.asyncio
    async def test_interview_context(self, tts):
        """Interview context generation should succeed for at least 3 of 4 contexts."""
        contexts = [
            ("Tell me about your experience.", "question", "early"),
            ("That's a great example.", "acknowledgment", "mid"),
            ("Can you tell me more about that?", "follow_up", "mid"),
            ("I noticed something different earlier.", "challenge", "late"),
        ]
        successes = 0

        for text, context_type, stage in contexts:
            try:
                audio = await tts.generate_for_interview_context(text, context_type, stage)
                if audio and len(audio) > 0:
                    successes += 1
            except Exception:
                pass

        assert successes >= 3, f"Interview context failures: {successes}/{len(contexts)}"

    def test_should_speak_logic(self, tts):
        """should_speak_this() must correctly filter text for TTS."""
        test_cases = [
            ("Tell me about yourself.", "question", True),
            ("Great answer!", "response", True),
            ("", "question", False),                          # empty
            ("Error: Connection failed", "error", False),     # error prefix
            ("DEBUG: test log", "system_message", False),     # debug prefix
            ("x" * 600, "response", False),                   # too long
            ("def function():\n    pass", "general", False),  # code block
        ]

        for text, context, expected in test_cases:
            result = tts.should_speak_this(text, context)
            short = (text[:30] + "...") if len(text) > 30 else text
            assert result == expected, (
                f"should_speak_this('{short}', '{context}') returned {result}, expected {expected}"
            )
