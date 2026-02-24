"""
Job Introduction Generator Service

This service generates warm, professional introductions for job-specific interviews.
It creates a complete opening sequence that:
- Welcomes the candidate
- Provides role and company overview
- Highlights key responsibilities
- Mentions requirements
- Transitions smoothly to the interview

Each segment is generated with natural language and converted to speech.
"""

import os
import json
import hashlib
import asyncio
from typing import List, Dict, Optional, Tuple
from enum import Enum
from openai import OpenAI

# Import related services
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from services.tts_service import TTSService, get_tts_service
    from services.interviewer_personality import InterviewerPersonality, get_interviewer_personality
except ImportError:
    TTSService = None
    InterviewerPersonality = None


class IntroductionMode(Enum):
    """Introduction length/detail modes."""
    CONCISE = "concise"      # 30-45 seconds total
    DETAILED = "detailed"    # 60-90 seconds total


class SegmentType(Enum):
    """Types of introduction segments."""
    GREETING = "greeting"
    ROLE_OVERVIEW = "role_overview"
    RESPONSIBILITIES = "responsibilities"
    REQUIREMENTS = "requirements"
    TRANSITION = "transition"
    FIRST_QUESTION = "first_question"


# Segment ordering (always in this sequence)
SEGMENT_ORDER = [
    SegmentType.GREETING,
    SegmentType.ROLE_OVERVIEW,
    SegmentType.RESPONSIBILITIES,
    SegmentType.REQUIREMENTS,
    SegmentType.TRANSITION,
]

# Default duration estimates per segment (in seconds)
SEGMENT_DURATIONS = {
    IntroductionMode.CONCISE: {
        SegmentType.GREETING: 4,
        SegmentType.ROLE_OVERVIEW: 8,
        SegmentType.RESPONSIBILITIES: 10,
        SegmentType.REQUIREMENTS: 8,
        SegmentType.TRANSITION: 4,
    },
    IntroductionMode.DETAILED: {
        SegmentType.GREETING: 6,
        SegmentType.ROLE_OVERVIEW: 15,
        SegmentType.RESPONSIBILITIES: 20,
        SegmentType.REQUIREMENTS: 15,
        SegmentType.TRANSITION: 6,
    },
}


class JobIntroductionGenerator:
    """
    Generates warm, professional introductions for job-specific interviews.

    Creates complete opening sequences with:
    - Natural language generation via OpenAI
    - Text-to-speech conversion via TTSService
    - Personality-driven variety via InterviewerPersonality
    """

    def __init__(
        self,
        interviewer_personality: Optional['InterviewerPersonality'] = None,
        tts_service: Optional['TTSService'] = None,
        mode: IntroductionMode = IntroductionMode.CONCISE
    ):
        """
        Initialize the job introduction generator.

        Args:
            interviewer_personality: Service for personality-driven text variations
            tts_service: Service for text-to-speech conversion
            mode: Introduction length mode (CONCISE or DETAILED)
        """
        self.personality = interviewer_personality
        self.tts_service = tts_service
        self.mode = mode
        self.client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

        # Audio settings for introductions
        self.audio_voice = "alloy"  # Professional voice
        self.audio_speed = 0.9      # Slightly slower for clarity

        # Lazy load services if not provided
        self._services_initialized = False

    def _ensure_services(self):
        """Lazy initialize services if not provided."""
        if self._services_initialized:
            return

        if self.personality is None:
            try:
                self.personality = get_interviewer_personality()
            except Exception as e:
                print(f"Could not initialize InterviewerPersonality: {e}")

        if self.tts_service is None:
            try:
                self.tts_service = get_tts_service()
            except Exception as e:
                print(f"Could not initialize TTSService: {e}")

        self._services_initialized = True

    async def generate_opening_sequence(
        self,
        job_description: Dict,
        candidate_name: str = None,
        candidate_resume_summary: str = None,
        generate_audio: bool = True
    ) -> List[Dict]:
        """
        Generate complete opening sequence for job-specific interview.

        Args:
            job_description: Dict containing job details (company, title, responsibilities, etc.)
            candidate_name: Optional candidate name for personalization
            candidate_resume_summary: Optional resume summary for personalization
            generate_audio: Whether to generate TTS audio for each segment

        Returns:
            List of introduction segments with text and optional audio URLs

        Example job_description:
        {
            "company_name": "Google",
            "job_title": "Senior Software Engineer",
            "team_name": "Backend Infrastructure Team",
            "location": "Remote / San Francisco",
            "responsibilities": ["Build scalable systems", "Design APIs", "Mentor engineers"],
            "requirements": ["5+ years Python", "System design skills", "Microservices experience"],
            "nice_to_have": ["Go or Rust", "Cloud platforms"],
            "company_description": "Google is a tech leader...",
            "role_description": "Full role description..."
        }
        """
        self._ensure_services()

        # Extract key fields with fallbacks
        company_name = job_description.get("company_name", "the company")
        job_title = job_description.get("job_title", "this position")
        team_name = job_description.get("team_name")
        responsibilities = job_description.get("responsibilities", [])
        requirements = job_description.get("requirements", [])
        nice_to_have = job_description.get("nice_to_have", [])
        company_description = job_description.get("company_description")
        role_description = job_description.get("role_description")
        location = job_description.get("location")

        segments = []

        # 1. Generate greeting
        greeting_text = await self._generate_greeting(
            company_name=company_name,
            job_title=job_title,
            candidate_name=candidate_name
        )
        segments.append({
            "segment_type": SegmentType.GREETING.value,
            "text": greeting_text,
            "order": 1,
            "duration_estimate_seconds": self._get_duration_estimate(SegmentType.GREETING)
        })

        # 2. Generate role overview
        role_overview_text = await self._generate_role_overview(
            job_description=job_description
        )
        segments.append({
            "segment_type": SegmentType.ROLE_OVERVIEW.value,
            "text": role_overview_text,
            "order": 2,
            "duration_estimate_seconds": self._get_duration_estimate(SegmentType.ROLE_OVERVIEW)
        })

        # 3. Generate responsibilities summary
        if responsibilities:
            responsibilities_text = await self._generate_responsibilities_summary(
                responsibilities=responsibilities
            )
            segments.append({
                "segment_type": SegmentType.RESPONSIBILITIES.value,
                "text": responsibilities_text,
                "order": 3,
                "duration_estimate_seconds": self._get_duration_estimate(SegmentType.RESPONSIBILITIES)
            })

        # 4. Generate requirements summary
        if requirements:
            requirements_text = await self._generate_requirements_summary(
                requirements=requirements,
                nice_to_have=nice_to_have
            )
            segments.append({
                "segment_type": SegmentType.REQUIREMENTS.value,
                "text": requirements_text,
                "order": 4,
                "duration_estimate_seconds": self._get_duration_estimate(SegmentType.REQUIREMENTS)
            })

        # 5. Generate transition
        transition_text = await self._generate_transition(job_title=job_title)
        segments.append({
            "segment_type": SegmentType.TRANSITION.value,
            "text": transition_text,
            "order": 5,
            "duration_estimate_seconds": self._get_duration_estimate(SegmentType.TRANSITION)
        })

        # 6. Generate audio for all segments if requested
        if generate_audio:
            segments = await self._generate_audio_for_segments(segments)

        return segments

    async def _generate_greeting(
        self,
        company_name: str,
        job_title: str,
        candidate_name: str = None
    ) -> str:
        """
        Generate warm greeting for the candidate.

        Args:
            company_name: Name of the company
            job_title: Job title being interviewed for
            candidate_name: Optional candidate name for personalization

        Returns:
            Greeting text string
        """
        # Greeting variations
        greetings_with_name = [
            f"Hi {candidate_name}! Thanks for your interest in the {job_title} position at {company_name}.",
            f"Hello {candidate_name}! Great to have you here for the {job_title} interview at {company_name}.",
            f"Welcome, {candidate_name}! We're excited you're interested in the {job_title} role at {company_name}.",
            f"Hi {candidate_name}, thanks for taking the time to interview for the {job_title} position at {company_name}.",
        ]

        greetings_without_name = [
            f"Hi! Thanks for applying to {company_name} for the {job_title} role.",
            f"Hello and welcome! Thanks for your interest in the {job_title} position at {company_name}.",
            f"Welcome! We're excited you're interested in the {job_title} role at {company_name}.",
            f"Hi there! Thanks for taking the time to interview for the {job_title} position at {company_name}.",
            f"Great to have you here for the {job_title} interview at {company_name}.",
        ]

        # Select appropriate greeting
        if candidate_name:
            greetings = greetings_with_name
        else:
            greetings = greetings_without_name

        # Use personality service for variety if available
        if self.personality:
            try:
                # Use a hash of the company+job to get consistent but varied selection
                seed = hash(f"{company_name}{job_title}") % len(greetings)
                return greetings[seed]
            except Exception:
                pass

        # Default to first greeting
        import random
        return random.choice(greetings)

    async def _generate_role_overview(
        self,
        job_description: Dict
    ) -> str:
        """
        Generate overview of the role and team.

        Args:
            job_description: Full job description dict

        Returns:
            Role overview text (2-3 sentences max)
        """
        company_name = job_description.get("company_name", "the company")
        job_title = job_description.get("job_title", "this role")
        team_name = job_description.get("team_name")
        company_description = job_description.get("company_description", "")
        role_description = job_description.get("role_description", "")
        location = job_description.get("location")

        # Build context for LLM
        context_parts = []
        if team_name:
            context_parts.append(f"Team: {team_name}")
        if location:
            context_parts.append(f"Location: {location}")
        if company_description:
            context_parts.append(f"Company: {company_description[:200]}")
        if role_description:
            context_parts.append(f"Role: {role_description[:300]}")

        context = "\n".join(context_parts) if context_parts else "General software engineering role"

        prompt = f"""Generate a brief role overview for an interview (2-3 sentences max).

Job Title: {job_title}
Company: {company_name}
{context}

Write a natural, conversational overview that:
- Mentions the team if available
- Explains the high-level purpose of the role
- Hints at impact/scope
- Is warm and professional

Example format: "This role is with our Backend Infrastructure Team. You'd be working on systems that power our core services, serving millions of users daily."

Keep it concise and avoid buzzwords. Just the overview, no greeting or transition."""

        try:
            overview = await self.generate_with_llm(prompt, max_tokens=150)
            return overview.strip()
        except Exception as e:
            print(f"LLM generation failed for role overview: {e}")
            # Fallback to template
            if team_name:
                return f"This role is with the {team_name} at {company_name}. You'd be working on key projects that drive our core business objectives."
            return f"As a {job_title} at {company_name}, you'll be contributing to impactful projects that matter to our organization."

    async def _generate_responsibilities_summary(
        self,
        responsibilities: List[str]
    ) -> str:
        """
        Summarize key responsibilities in natural sentences.

        Args:
            responsibilities: List of responsibility strings

        Returns:
            Natural summary of responsibilities (not bullet points)
        """
        if not responsibilities:
            return ""

        # Take top 3-4 responsibilities
        top_responsibilities = responsibilities[:4]

        prompt = f"""Summarize these job responsibilities in natural, conversational sentences.

Responsibilities:
{chr(10).join(f'- {r}' for r in top_responsibilities)}

Rules:
- Combine into 2-3 flowing sentences (NOT bullet points)
- Start with "Your main responsibilities would include..." or similar
- Keep it under 30 seconds when spoken (roughly 75-80 words)
- Be specific but concise
- Make it sound engaging, not boring

Just write the summary, nothing else."""

        try:
            summary = await self.generate_with_llm(prompt, max_tokens=120)
            return summary.strip()
        except Exception as e:
            print(f"LLM generation failed for responsibilities: {e}")
            # Fallback to template
            resp_list = ", ".join(top_responsibilities[:-1]) if len(top_responsibilities) > 1 else top_responsibilities[0]
            if len(top_responsibilities) > 1:
                resp_list += f", and {top_responsibilities[-1]}"
            return f"Your main responsibilities would include {resp_list}."

    async def _generate_requirements_summary(
        self,
        requirements: List[str],
        nice_to_have: List[str] = None
    ) -> str:
        """
        Summarize what the company is looking for.

        Args:
            requirements: List of required qualifications
            nice_to_have: Optional list of preferred qualifications

        Returns:
            Natural summary distinguishing required vs nice-to-have
        """
        if not requirements:
            return ""

        # Extract top skills
        top_requirements = self._extract_top_skills(requirements, count=3)
        top_nice_to_have = self._extract_top_skills(nice_to_have, count=2) if nice_to_have else []

        prompt = f"""Summarize these job requirements in a natural, encouraging way.

Required qualifications:
{chr(10).join(f'- {r}' for r in top_requirements)}

{"Nice to have:" + chr(10) + chr(10).join(f'- {n}' for n in top_nice_to_have) if top_nice_to_have else ""}

Rules:
- Write 2-3 natural sentences (NOT bullet points)
- Start with "We're looking for someone with..." or similar
- Distinguish between required and nice-to-have if applicable
- Be encouraging, not intimidating
- Keep it under 25 seconds when spoken (roughly 60-65 words)

Just write the summary, nothing else."""

        try:
            summary = await self.generate_with_llm(prompt, max_tokens=100)
            return summary.strip()
        except Exception as e:
            print(f"LLM generation failed for requirements: {e}")
            # Fallback to template
            req_text = ", ".join(top_requirements)
            result = f"We're looking for someone with {req_text}."
            if top_nice_to_have:
                nice_text = " or ".join(top_nice_to_have)
                result += f" If you've also worked with {nice_text}, that's a plus."
            return result

    async def _generate_transition(
        self,
        job_title: str
    ) -> str:
        """
        Create smooth transition to the actual interview.

        Args:
            job_title: The job title being interviewed for

        Returns:
            Transition text leading into first question
        """
        transitions = [
            "Now that you understand what we're looking for, let's talk about your background.",
            "With that context in mind, I'd love to hear about your experience.",
            f"Let's dive into your qualifications for this {job_title} role.",
            "With that overview, let's get to know you better.",
            "Now, let's talk about you and your experience.",
            "That's what we're looking for. Now, tell me about yourself.",
            "With that context, let's discuss how your background fits.",
        ]

        # Use personality for variety if available
        if self.personality:
            try:
                seed = hash(job_title) % len(transitions)
                return transitions[seed]
            except Exception:
                pass

        import random
        return random.choice(transitions)

    async def generate_personalized_first_question(
        self,
        job_description: Dict,
        candidate_resume_summary: str = None
    ) -> str:
        """
        Generate personalized first question tied to the JD.

        Instead of generic "Tell me about yourself", creates a question
        that immediately ties to the role.

        Args:
            job_description: Job description dict
            candidate_resume_summary: Optional resume summary for personalization

        Returns:
            Personalized first question string
        """
        company_name = job_description.get("company_name", "the company")
        job_title = job_description.get("job_title", "this position")
        requirements = job_description.get("requirements", [])

        # If we have resume summary, try to find matching skills
        matching_skills = []
        if candidate_resume_summary and requirements:
            # Simple keyword matching
            resume_lower = candidate_resume_summary.lower()
            for req in requirements[:5]:
                req_words = req.lower().split()
                for word in req_words:
                    if len(word) > 3 and word in resume_lower:
                        # Found a matching skill
                        matching_skills.append(req)
                        break

        # Generate question based on context
        if matching_skills:
            skill_mention = matching_skills[0]
            prompt = f"""Generate a personalized first interview question.

Job: {job_title} at {company_name}
Candidate has experience with: {skill_mention}

Create a first question that:
- Starts like "Tell me about yourself..."
- Ties their experience to the role
- Is warm and engaging

Example: "I see you have experience with distributed systems. Tell me about yourself and how that experience relates to what we're building here."

Write only the question, nothing else."""
        else:
            prompt = f"""Generate a personalized first interview question.

Job: {job_title} at {company_name}

Create a first question that:
- Starts like "Tell me about yourself..."
- Asks what attracted them to this specific role
- Is warm and engaging

Example: "Tell me about yourself and specifically what attracted you to the {job_title} position at {company_name}."

Write only the question, nothing else."""

        try:
            question = await self.generate_with_llm(prompt, max_tokens=80)
            return question.strip()
        except Exception as e:
            print(f"LLM generation failed for first question: {e}")
            # Fallback
            if matching_skills:
                return f"I see you have relevant experience. Tell me about yourself and how your background relates to what we're looking for in a {job_title}."
            return f"Tell me about yourself and specifically what attracted you to the {job_title} position at {company_name}."

    async def _generate_audio_for_segments(
        self,
        segments: List[Dict]
    ) -> List[Dict]:
        """
        Generate TTS audio for all segments.

        Args:
            segments: List of segment dicts with 'text' field

        Returns:
            Enhanced segments with 'audio_url' fields populated
        """
        if not self.tts_service:
            print("TTS service not available, skipping audio generation")
            return segments

        enhanced_segments = []

        for segment in segments:
            try:
                text = segment.get("text", "")
                segment_type = segment.get("segment_type", "intro")

                if not text:
                    enhanced_segments.append(segment)
                    continue

                # Generate cache key based on text content
                text_hash = hashlib.md5(text.encode()).hexdigest()[:8]
                cache_key = f"intro_{segment_type}_{text_hash}"

                # Generate audio with caching
                audio_bytes, audio_path = await self.tts_service.generate_and_cache(
                    text=text,
                    cache_key=cache_key,
                    voice=self.audio_voice,
                    speed=self.audio_speed
                )

                if audio_path:
                    # Extract just the filename for the URL
                    filename = os.path.basename(audio_path)
                    segment["audio_url"] = f"/api/audio/{filename}"

                    # Update duration estimate based on audio length
                    if audio_bytes:
                        # Rough estimate: MP3 at 128kbps = 16KB per second
                        estimated_duration = len(audio_bytes) / 16000
                        segment["duration_estimate_seconds"] = round(estimated_duration, 1)

                enhanced_segments.append(segment)

            except Exception as e:
                print(f"Failed to generate audio for segment {segment.get('segment_type')}: {e}")
                enhanced_segments.append(segment)

        return enhanced_segments

    def _extract_top_skills(
        self,
        requirements: List[str],
        count: int = 3
    ) -> List[str]:
        """
        Extract top N most important skills/requirements.

        Prioritizes:
        1. Years of experience requirements
        2. Technical skills
        3. "Must have" keywords

        Args:
            requirements: List of requirement strings
            count: Number of top skills to extract

        Returns:
            List of top skills (up to count)
        """
        if not requirements:
            return []

        # Score each requirement
        scored = []
        for req in requirements:
            score = 0
            req_lower = req.lower()

            # Prioritize years of experience
            if "year" in req_lower or "yr" in req_lower:
                score += 10

            # Prioritize specific technologies/skills
            tech_keywords = [
                "python", "java", "javascript", "react", "node", "sql", "aws",
                "kubernetes", "docker", "api", "microservices", "system design",
                "machine learning", "data", "cloud", "agile", "ci/cd"
            ]
            for tech in tech_keywords:
                if tech in req_lower:
                    score += 5
                    break

            # Prioritize "must have" or "required" keywords
            if "must" in req_lower or "required" in req_lower or "essential" in req_lower:
                score += 8

            # Prioritize degree requirements
            if "degree" in req_lower or "bachelor" in req_lower or "master" in req_lower:
                score += 6

            # Shorter requirements are often more specific/important
            if len(req) < 50:
                score += 2

            scored.append((score, req))

        # Sort by score descending and return top N
        scored.sort(key=lambda x: x[0], reverse=True)
        return [req for score, req in scored[:count]]

    async def generate_with_llm(
        self,
        prompt: str,
        max_tokens: int = 200
    ) -> str:
        """
        Use OpenAI to generate natural introduction text.

        Args:
            prompt: The prompt for generation
            max_tokens: Maximum tokens in response

        Returns:
            Generated text string
        """
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                temperature=0.7,
                max_tokens=max_tokens,
                messages=[
                    {
                        "role": "system",
                        "content": """You are a professional, warm interviewer introducing job roles.
Your tone is:
- Professional but friendly
- Welcoming and encouraging
- Clear and concise
- Not overwhelming or intimidating

Keep responses brief and natural-sounding when spoken aloud."""
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )

            return response.choices[0].message.content.strip()

        except Exception as e:
            print(f"OpenAI generation failed: {e}")
            raise

    def _get_duration_estimate(self, segment_type: SegmentType) -> int:
        """Get duration estimate for a segment type based on mode."""
        return SEGMENT_DURATIONS.get(self.mode, SEGMENT_DURATIONS[IntroductionMode.CONCISE]).get(
            segment_type, 5
        )

    async def generate_full_introduction_with_audio(
        self,
        job_description: Dict,
        candidate_name: str = None,
        candidate_resume_summary: str = None,
        include_first_question: bool = True
    ) -> Dict:
        """
        Generate complete introduction package with all segments and audio.

        This is a convenience method that generates everything in one call.

        Args:
            job_description: Job description dict
            candidate_name: Optional candidate name
            candidate_resume_summary: Optional resume summary
            include_first_question: Whether to include personalized first question

        Returns:
            Dict with:
            {
                "segments": [...],
                "first_question": {...} or None,
                "total_duration_seconds": int,
                "mode": "concise" or "detailed"
            }
        """
        # Generate opening sequence
        segments = await self.generate_opening_sequence(
            job_description=job_description,
            candidate_name=candidate_name,
            candidate_resume_summary=candidate_resume_summary,
            generate_audio=True
        )

        # Calculate total duration
        total_duration = sum(s.get("duration_estimate_seconds", 5) for s in segments)

        result = {
            "segments": segments,
            "first_question": None,
            "total_duration_seconds": total_duration,
            "mode": self.mode.value
        }

        # Generate first question if requested
        if include_first_question:
            first_q_text = await self.generate_personalized_first_question(
                job_description=job_description,
                candidate_resume_summary=candidate_resume_summary
            )

            first_question = {
                "segment_type": SegmentType.FIRST_QUESTION.value,
                "text": first_q_text,
                "order": len(segments) + 1,
                "duration_estimate_seconds": 8
            }

            # Generate audio for first question
            if self.tts_service:
                try:
                    text_hash = hashlib.md5(first_q_text.encode()).hexdigest()[:8]
                    cache_key = f"intro_first_question_{text_hash}"

                    audio_bytes, audio_path = await self.tts_service.generate_and_cache(
                        text=first_q_text,
                        cache_key=cache_key,
                        voice=self.audio_voice,
                        speed=self.audio_speed
                    )

                    if audio_path:
                        filename = os.path.basename(audio_path)
                        first_question["audio_url"] = f"/api/audio/{filename}"

                except Exception as e:
                    print(f"Failed to generate audio for first question: {e}")

            result["first_question"] = first_question
            result["total_duration_seconds"] += first_question["duration_estimate_seconds"]

        return result


# ==================== Module-level convenience functions ====================

_generator_instance = None


def get_job_introduction_generator(
    mode: IntroductionMode = IntroductionMode.CONCISE
) -> JobIntroductionGenerator:
    """
    Get or create a JobIntroductionGenerator instance.

    Args:
        mode: Introduction length mode

    Returns:
        JobIntroductionGenerator instance
    """
    global _generator_instance

    if _generator_instance is None or _generator_instance.mode != mode:
        _generator_instance = JobIntroductionGenerator(mode=mode)

    return _generator_instance


async def generate_job_introduction(
    job_description: Dict,
    candidate_name: str = None,
    candidate_resume_summary: str = None,
    mode: str = "concise",
    include_first_question: bool = True,
    generate_audio: bool = True
) -> Dict:
    """
    Convenience function to generate a complete job introduction.

    Args:
        job_description: Job description dict
        candidate_name: Optional candidate name
        candidate_resume_summary: Optional resume summary
        mode: "concise" (30-45s) or "detailed" (60-90s)
        include_first_question: Whether to include personalized first question
        generate_audio: Whether to generate TTS audio

    Returns:
        Complete introduction package dict
    """
    intro_mode = IntroductionMode.DETAILED if mode == "detailed" else IntroductionMode.CONCISE
    generator = get_job_introduction_generator(mode=intro_mode)

    if generate_audio:
        return await generator.generate_full_introduction_with_audio(
            job_description=job_description,
            candidate_name=candidate_name,
            candidate_resume_summary=candidate_resume_summary,
            include_first_question=include_first_question
        )
    else:
        segments = await generator.generate_opening_sequence(
            job_description=job_description,
            candidate_name=candidate_name,
            candidate_resume_summary=candidate_resume_summary,
            generate_audio=False
        )

        return {
            "segments": segments,
            "first_question": None,
            "total_duration_seconds": sum(s.get("duration_estimate_seconds", 5) for s in segments),
            "mode": mode
        }


# ==================== Example usage and testing ====================

async def _test_generator():
    """Test the job introduction generator."""

    # Sample job description
    sample_jd = {
        "company_name": "Google",
        "job_title": "Senior Software Engineer",
        "team_name": "Backend Infrastructure Team",
        "location": "Remote / San Francisco",
        "responsibilities": [
            "Build scalable distributed systems",
            "Design APIs for billions of users",
            "Mentor junior engineers",
            "Participate in code reviews"
        ],
        "requirements": [
            "5+ years Python experience",
            "Strong system design skills",
            "Experience with microservices architecture",
            "Excellent communication skills"
        ],
        "nice_to_have": [
            "Go or Rust experience",
            "Cloud platform expertise (GCP, AWS)"
        ],
        "company_description": "Google is a leading technology company focused on organizing the world's information.",
        "role_description": "Join our backend team to build the infrastructure that powers Google's core services."
    }

    print("=" * 60)
    print("Testing Job Introduction Generator")
    print("=" * 60)

    # Create generator
    generator = JobIntroductionGenerator(mode=IntroductionMode.CONCISE)

    # Generate opening sequence (without audio for testing)
    print("\nGenerating opening sequence...")
    segments = await generator.generate_opening_sequence(
        job_description=sample_jd,
        candidate_name="Alex",
        generate_audio=False
    )

    print(f"\nGenerated {len(segments)} segments:\n")
    total_duration = 0

    for segment in segments:
        print(f"[{segment['order']}] {segment['segment_type'].upper()}")
        print(f"    Duration: ~{segment['duration_estimate_seconds']}s")
        print(f"    Text: {segment['text'][:100]}...")
        print()
        total_duration += segment['duration_estimate_seconds']

    print(f"Total estimated duration: {total_duration} seconds")

    # Generate personalized first question
    print("\n" + "-" * 40)
    print("Generating personalized first question...")

    first_question = await generator.generate_personalized_first_question(
        job_description=sample_jd,
        candidate_resume_summary="5 years experience with Python, Django, distributed systems, and AWS"
    )

    print(f"\nFirst Question: {first_question}")

    print("\n" + "=" * 60)
    print("Test complete!")
    print("=" * 60)


if __name__ == "__main__":
    import asyncio
    asyncio.run(_test_generator())
