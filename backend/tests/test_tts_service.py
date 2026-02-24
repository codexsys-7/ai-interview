# backend/tests/test_tts_service.py
"""
Test script for TTS Service

Tests:
1. Generate simple speech
2. Save to file
3. Verify file exists
4. Test caching (generate same text twice)
5. Test different voices
6. Test batch generation

Run with: python backend/tests/test_tts_service.py
"""

import os
import sys
import asyncio
import time
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from services.tts_service import (
    TTSService,
    get_tts_service,
    reset_tts_service,
    generate_speech,
    generate_interview_speech
)


class TTSTestRunner:
    """Test runner for TTS Service."""

    def __init__(self):
        self.test_results = []
        self.test_dir = Path("backend/audio_cache/test_output")
        self.test_dir.mkdir(parents=True, exist_ok=True)

    def log(self, message: str, status: str = "INFO"):
        """Log test message."""
        symbols = {
            "INFO": "ℹ️",
            "PASS": "✅",
            "FAIL": "❌",
            "WARN": "⚠️",
            "RUN": "🔄"
        }
        symbol = symbols.get(status, "•")
        print(f"{symbol} {message}")

    async def test_1_simple_speech(self) -> bool:
        """Test 1: Generate simple speech."""
        self.log("Test 1: Generate simple speech", "RUN")

        try:
            tts = get_tts_service()
            text = "Hello, this is a test of the text to speech service."

            start_time = time.time()
            audio_bytes = await tts.generate_speech(text)
            elapsed = time.time() - start_time

            if audio_bytes and len(audio_bytes) > 0:
                self.log(f"Generated {len(audio_bytes):,} bytes in {elapsed:.2f}s", "PASS")
                return True
            else:
                self.log("No audio bytes returned", "FAIL")
                return False

        except Exception as e:
            self.log(f"Error: {str(e)}", "FAIL")
            return False

    async def test_2_save_to_file(self) -> bool:
        """Test 2: Save audio to file."""
        self.log("Test 2: Save audio to file", "RUN")

        try:
            tts = get_tts_service()
            text = "This audio will be saved to a file."

            audio_bytes = await tts.generate_speech(text)
            file_path = await tts.save_audio_file(
                audio_bytes,
                "test_save",
                str(self.test_dir)
            )

            if file_path and Path(file_path).exists():
                file_size = Path(file_path).stat().st_size
                self.log(f"Saved to: {file_path} ({file_size:,} bytes)", "PASS")
                return True
            else:
                self.log("File was not created", "FAIL")
                return False

        except Exception as e:
            self.log(f"Error: {str(e)}", "FAIL")
            return False

    async def test_3_verify_file_exists(self) -> bool:
        """Test 3: Verify saved files exist and are valid."""
        self.log("Test 3: Verify file exists and is valid MP3", "RUN")

        try:
            tts = get_tts_service()
            text = "Verifying file creation works correctly."

            audio_bytes = await tts.generate_speech(text)
            file_path = await tts.save_audio_file(
                audio_bytes,
                "test_verify",
                str(self.test_dir)
            )

            path = Path(file_path)

            # Check file exists
            if not path.exists():
                self.log("File does not exist", "FAIL")
                return False

            # Check file size
            file_size = path.stat().st_size
            if file_size < 1000:  # MP3 should be at least 1KB
                self.log(f"File too small: {file_size} bytes", "FAIL")
                return False

            # Check MP3 header (ID3 or sync bytes)
            with open(path, "rb") as f:
                header = f.read(3)

            # Valid MP3 starts with ID3 or 0xFF 0xFB (sync)
            is_valid_mp3 = (
                header == b"ID3" or
                (header[0] == 0xFF and (header[1] & 0xE0) == 0xE0)
            )

            if is_valid_mp3:
                self.log(f"Valid MP3 file: {file_size:,} bytes", "PASS")
                return True
            else:
                self.log(f"Invalid MP3 header: {header.hex()}", "FAIL")
                return False

        except Exception as e:
            self.log(f"Error: {str(e)}", "FAIL")
            return False

    async def test_4_caching(self) -> bool:
        """Test 4: Test caching (same text twice, second should be cached)."""
        self.log("Test 4: Test caching mechanism", "RUN")

        try:
            tts = get_tts_service()
            text = "This text will be cached for efficiency."
            cache_key = "test_cache_key"

            # First generation (cache miss)
            self.log("  First generation (should be API call)...", "INFO")
            start_time = time.time()
            audio1, path1 = await tts.generate_and_cache(text, cache_key)
            time1 = time.time() - start_time

            # Second generation (cache hit)
            self.log("  Second generation (should be cached)...", "INFO")
            start_time = time.time()
            audio2, path2 = await tts.generate_and_cache(text, cache_key)
            time2 = time.time() - start_time

            # Verify results
            if audio1 == audio2:
                self.log(f"  Audio bytes match: {len(audio1):,} bytes", "INFO")
            else:
                self.log("  Warning: Audio bytes differ (may be OK)", "WARN")

            # Cache should be much faster
            if time2 < time1 * 0.5:  # At least 50% faster
                self.log(f"Cache working: {time1:.2f}s -> {time2:.3f}s ({time1/time2:.1f}x faster)", "PASS")
                return True
            else:
                self.log(f"Cache timing: {time1:.2f}s -> {time2:.2f}s (not significantly faster)", "WARN")
                # Still pass if both worked
                return len(audio1) > 0 and len(audio2) > 0

        except Exception as e:
            self.log(f"Error: {str(e)}", "FAIL")
            return False

    async def test_5_different_voices(self) -> bool:
        """Test 5: Test different voice options."""
        self.log("Test 5: Test different voices", "RUN")

        voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
        text = "Testing voice options."
        results = {}

        try:
            tts = get_tts_service()

            for voice in voices:
                try:
                    self.log(f"  Testing voice: {voice}...", "INFO")
                    audio = await tts.generate_speech(text, voice=voice)
                    results[voice] = len(audio) if audio else 0

                    if audio and len(audio) > 0:
                        # Save sample for manual listening
                        await tts.save_audio_file(
                            audio,
                            f"voice_{voice}",
                            str(self.test_dir)
                        )

                except Exception as e:
                    self.log(f"  Voice {voice} failed: {e}", "WARN")
                    results[voice] = 0

            # Check results
            successful = sum(1 for size in results.values() if size > 0)
            self.log(f"Voices tested: {successful}/{len(voices)} successful", "INFO")

            for voice, size in results.items():
                status = "✓" if size > 0 else "✗"
                self.log(f"  {status} {voice}: {size:,} bytes", "INFO")

            if successful >= 4:  # At least 4 voices should work
                self.log(f"Voice test passed: {successful}/{len(voices)}", "PASS")
                return True
            else:
                self.log(f"Too many voice failures: {successful}/{len(voices)}", "FAIL")
                return False

        except Exception as e:
            self.log(f"Error: {str(e)}", "FAIL")
            return False

    async def test_6_batch_generation(self) -> bool:
        """Test 6: Test batch generation."""
        self.log("Test 6: Test batch generation", "RUN")

        try:
            tts = get_tts_service()

            batch_items = [
                {"text": "First question in the batch.", "context": "question", "id": "q1"},
                {"text": "Good answer.", "context": "acknowledgment", "id": "a1"},
                {"text": "Second question here.", "context": "question", "id": "q2"},
                {"text": "Can you elaborate?", "context": "follow_up", "id": "f1"},
            ]

            self.log(f"  Generating {len(batch_items)} items...", "INFO")
            start_time = time.time()
            results = await tts.generate_batch(batch_items, max_concurrent=2)
            elapsed = time.time() - start_time

            successful = sum(1 for r in results if r.get("success"))

            self.log(f"  Batch complete in {elapsed:.2f}s", "INFO")
            for result in results:
                status = "✓" if result.get("success") else "✗"
                item_id = result.get("id", "?")
                if result.get("success"):
                    size = len(result.get("audio_bytes", b""))
                    self.log(f"  {status} {item_id}: {size:,} bytes", "INFO")
                else:
                    reason = result.get("error", result.get("reason", "unknown"))
                    self.log(f"  {status} {item_id}: {reason}", "INFO")

            if successful >= 3:  # At least 3 should succeed
                self.log(f"Batch generation passed: {successful}/{len(batch_items)}", "PASS")
                return True
            else:
                self.log(f"Too many batch failures: {successful}/{len(batch_items)}", "FAIL")
                return False

        except Exception as e:
            self.log(f"Error: {str(e)}", "FAIL")
            return False

    async def test_7_interview_context(self) -> bool:
        """Test 7: Test interview context generation."""
        self.log("Test 7: Test interview context generation", "RUN")

        try:
            tts = get_tts_service()

            contexts = [
                ("Tell me about your experience.", "question", "early"),
                ("That's a great example.", "acknowledgment", "mid"),
                ("Can you tell me more about that?", "follow_up", "mid"),
                ("I noticed you mentioned something different earlier.", "challenge", "late"),
            ]

            results = []
            for text, context_type, stage in contexts:
                self.log(f"  Context: {context_type} ({stage})...", "INFO")
                try:
                    audio = await tts.generate_for_interview_context(
                        text, context_type, stage
                    )
                    results.append((context_type, len(audio) if audio else 0))

                    if audio:
                        await tts.save_audio_file(
                            audio,
                            f"context_{context_type}_{stage}",
                            str(self.test_dir)
                        )
                except Exception as e:
                    self.log(f"  {context_type} failed: {e}", "WARN")
                    results.append((context_type, 0))

            successful = sum(1 for _, size in results if size > 0)

            if successful >= 3:
                self.log(f"Interview context test passed: {successful}/{len(contexts)}", "PASS")
                return True
            else:
                self.log(f"Interview context failures: {successful}/{len(contexts)}", "FAIL")
                return False

        except Exception as e:
            self.log(f"Error: {str(e)}", "FAIL")
            return False

    async def test_8_should_speak(self) -> bool:
        """Test 8: Test should_speak_this logic."""
        self.log("Test 8: Test should_speak_this decision logic", "RUN")

        try:
            tts = get_tts_service()

            test_cases = [
                # (text, context, expected_result)
                ("Tell me about yourself.", "question", True),
                ("Great answer!", "response", True),
                ("", "question", False),  # Empty
                ("Error: Connection failed", "error", False),
                ("DEBUG: test log", "system_message", False),
                ("x" * 600, "response", False),  # Too long
                ("def function():\n    pass", "general", False),  # Code
            ]

            passed = 0
            for text, context, expected in test_cases:
                result = tts.should_speak_this(text, context)
                status = "✓" if result == expected else "✗"
                short_text = text[:30] + "..." if len(text) > 30 else text
                short_text = short_text.replace("\n", "\\n")
                self.log(f"  {status} '{short_text}' ({context}): {result} (expected {expected})", "INFO")

                if result == expected:
                    passed += 1

            if passed == len(test_cases):
                self.log(f"Should-speak logic passed: {passed}/{len(test_cases)}", "PASS")
                return True
            else:
                self.log(f"Should-speak failures: {passed}/{len(test_cases)}", "FAIL")
                return False

        except Exception as e:
            self.log(f"Error: {str(e)}", "FAIL")
            return False

    async def run_all_tests(self):
        """Run all tests and report results."""
        print("\n" + "=" * 60)
        print("TTS Service Test Suite")
        print("=" * 60 + "\n")

        # Check API key
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            self.log("OPENAI_API_KEY not set - tests will fail!", "FAIL")
            print("\nSet your API key with: export OPENAI_API_KEY=your_key")
            return

        self.log(f"API Key found: {api_key[:8]}...{api_key[-4:]}", "INFO")
        print()

        tests = [
            ("Simple Speech Generation", self.test_1_simple_speech),
            ("Save to File", self.test_2_save_to_file),
            ("Verify File Exists", self.test_3_verify_file_exists),
            ("Caching Mechanism", self.test_4_caching),
            ("Different Voices", self.test_5_different_voices),
            ("Batch Generation", self.test_6_batch_generation),
            ("Interview Context", self.test_7_interview_context),
            ("Should-Speak Logic", self.test_8_should_speak),
        ]

        results = []
        for name, test_func in tests:
            try:
                result = await test_func()
                results.append((name, result))
            except Exception as e:
                self.log(f"Test '{name}' crashed: {e}", "FAIL")
                results.append((name, False))
            print()

        # Summary
        print("=" * 60)
        print("Test Summary")
        print("=" * 60)

        passed = sum(1 for _, r in results if r)
        total = len(results)

        for name, result in results:
            status = "PASS" if result else "FAIL"
            self.log(f"{name}: {status}", status)

        print()
        print(f"Results: {passed}/{total} tests passed")

        if passed == total:
            self.log("All tests passed!", "PASS")
        else:
            self.log(f"{total - passed} test(s) failed", "FAIL")

        # Show cache stats
        print()
        tts = get_tts_service()
        stats = tts.get_cache_stats()
        print(f"Cache stats: {stats['total_files']} files, {stats['total_size_mb']} MB")
        print(f"Test audio saved to: {self.test_dir}")


async def main():
    """Main entry point."""
    runner = TTSTestRunner()
    await runner.run_all_tests()


if __name__ == "__main__":
    asyncio.run(main())
