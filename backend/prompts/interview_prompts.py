# backend/prompts/interview_prompts.py
"""
Interview Prompt Templates

This module contains all LLM prompt templates for intelligent question generation.
Each prompt is designed to produce professional, contextually-aware interview questions
that encourage STAR-format (Situation, Task, Action, Result) answers.

Usage:
    from prompts.interview_prompts import PromptTemplates

    prompt = PromptTemplates.standard_question(
        role="Software Engineer",
        difficulty="senior",
        conversation_summary="...",
        question_intent="technical_skills",
        question_number=3
    )
"""

from typing import Dict, List, Optional, Any


class PromptTemplates:
    """
    Static class containing all prompt templates for interview question generation.

    All methods are static and return formatted prompt strings ready for LLM consumption.
    Prompts are designed to:
    - Generate professional, natural-sounding questions
    - Encourage STAR-format responses from candidates
    - Maintain conversation flow and context awareness
    - Handle various interview scenarios (follow-ups, contradictions, deep dives)

    Attributes:
        DIFFICULTY_GUIDANCE (Dict): Guidance text for each difficulty level
        INTENT_DESCRIPTIONS (Dict): Descriptions for question intent categories
    """

    # Difficulty level guidance for calibrating question complexity
    DIFFICULTY_GUIDANCE = {
        "intern": {
            "level": "Entry-level / Intern",
            "expectations": "basic understanding, learning potential, enthusiasm",
            "avoid": "complex system design, leadership scenarios, production experience",
            "tone": "supportive and encouraging"
        },
        "junior": {
            "level": "Junior (1-2 years)",
            "expectations": "foundational skills, some practical experience, growth mindset",
            "avoid": "senior architecture decisions, team leadership",
            "tone": "supportive with moderate challenge"
        },
        "intermediate": {
            "level": "Intermediate (2-4 years)",
            "expectations": "solid practical knowledge, independent problem-solving, code quality awareness",
            "avoid": "executive-level strategic questions",
            "tone": "professional and moderately challenging"
        },
        "medium": {
            "level": "Mid-level (3-5 years)",
            "expectations": "strong technical skills, project ownership, mentoring ability",
            "avoid": "C-level strategy questions",
            "tone": "professional and challenging"
        },
        "senior": {
            "level": "Senior (5-8 years)",
            "expectations": "deep expertise, system design, technical leadership, mentoring",
            "avoid": "basic/trivial questions",
            "tone": "professional peer-to-peer discussion"
        },
        "lead": {
            "level": "Lead/Principal (8+ years)",
            "expectations": "technical strategy, team building, cross-org influence, architectural vision",
            "avoid": "entry-level technical questions",
            "tone": "strategic and executive"
        }
    }

    # Question intent category descriptions
    INTENT_DESCRIPTIONS = {
        "technical_skills": "technical knowledge, tools, frameworks, and hands-on capabilities",
        "problem_solving": "analytical thinking, debugging approach, and solution design",
        "behavioral": "past experiences, interpersonal skills, and work style",
        "situational": "hypothetical scenarios and decision-making approach",
        "leadership": "team management, mentoring, influence, and strategic thinking",
        "communication": "ability to explain complex concepts and collaborate effectively",
        "cultural_fit": "values alignment, work preferences, and team dynamics",
        "introduction": "background, experience overview, and motivation",
        "deep_expertise": "advanced knowledge in areas of passion or specialization",
        "clarification": "understanding nuances and resolving ambiguities"
    }

    # Few-shot examples from real interviews - organized by intent
    FEW_SHOT_EXAMPLES = {
        "introduction": [
            "Can you introduce yourself briefly?",
            "How would you define yourself today? Are you a senior software engineer focused on AI? Based on your past experience, how do you see yourself right now?",
            "Why this role, and why now?"
        ],
        "technical_skills": [
            "Can you explain which AWS services you have used in your day-to-day activities or throughout your experience?",
            "Can you tell me the difference between static methods, class methods, and instance methods?",
            "Walk me through a backend service you've designed. I'm looking for data models, APIs, error handling, and performance considerations.",
            "What kind of integrations did you work on within the AWS platform?",
            "For APIs, which authentication mechanism have you used? Can you explain that authentication process end to end?"
        ],
        "problem_solving": [
            "Let's say I give you a list in Python containing city names, and I ask you to remove the duplicates. How would you do it?",
            "Have you faced scenarios where a service was not running or timed out? What could have caused timeouts when deploying your Fast API on ECS?",
            "In multiple inheritance, if both parent classes have a method called 'run,' which one will execute?",
            "If I want to schedule a job to run every 55 minutes, how would you do that?",
            "Let's take an example: you have a Lambda function calling a third-party endpoint. If you face intermittent connectivity issues, what solutions would you suggest?"
        ],
        "behavioral": [
            "Can you pick one thing you personally shipped end-to-end in the last twelve months that maps closely to this position? Tell me about the problem, solution, and any measurable impact.",
            "Tell me about a time in your experience where you had to make trade-off decisions for a solution. How do you make trade-offs like that?",
            "What systems do you feel strongest owning end to end?",
            "What would your response be if I asked you what separates you from other candidates?",
            "Can you walk me through how you use AI in your day-to-day job? What tools and patterns do you use, and what do you delegate to AI?"
        ],
        "scenario_based": [
            "Can you give me two examples: when would you use a Lambda function versus when would you choose an ECS containerized service?",
            "Let's say you have a Fargate task doing batch processing of 100 documents, with each taking 20 minutes. How would you design this to handle failures and maximize speed?",
            "After months of development, you have Fast API, Lambdas, and ECS tasks running. At a high level, I'd like to know what's happening in my system. How would you approach this?",
            "If you had to be productive in Java Spring within 60 to 90 days, how would you approach that?"
        ],
        "system_design": [
            "Here's a real-time scenario: your Lambda function retrieves secrets from AWS Secrets Manager every time it's triggered. What is causing the latency, and how would you solve it?",
            "For a system where accuracy is critical, how would you design resilience around document processing?",
            "I have a domain with maximum ALB rules. I want to deploy 50 more applications. What would be the solution?",
            "Consider a system for finance - specifically an automated underwriting workflow where we analyze bank statements. How would you design this?"
        ],
        "architecture": [
            "Can you tell me about your multi-agent system and walk me through its architecture?",
            "How did you decide on agent boundaries and what each agent would focus on?",
            "What's the reasoning behind your choice of using LangChain versus LangGraph?",
            "What would be your go-to approach when designing something like this - would you use agents or workflows?"
        ],
        "leadership": [
            "What do you personally own versus what the team owns?",
            "Can you share a situation where you hired a candidate who went on to do exceptionally well? What specific traits did they have?",
            "How do you deploy with rollback safety?",
            "How do you handle multi-tenancy propagation and trace IDs end to end?"
        ],
        "work_experience": [
            "You've been at your current company for less than a year. What's going on there that has you looking to move?",
            "Have you created a Python library to be shared between your teams?",
            "What's your experience with relational databases from an application layer perspective?",
            "You mentioned using an LLM for reasoning - how exactly does it work?"
        ]
    }

    # Follow-up question templates from real interviews
    FOLLOW_UP_TEMPLATES = [
        "Can you walk me through the specific steps you took?",
        "Can you go one level more specific?",
        "What do you personally own versus what the team owns?",
        "How does the flow work when an API call comes in?",
        "Can you elaborate a bit more on that?",
        "Can you tell me more about YOUR specific contribution versus the team's?",
        "What were the measurable results of that project?",
        "What challenges did you face during implementation?"
    ]

    # Interviewer comment templates from real interviews
    INTERVIEWER_COMMENTS = {
        "acknowledgment": [
            "That is good.",
            "That's great.",
            "Perfect.",
            "Correct. Perfect answer.",
            "Great, thank you."
        ],
        "transition": [
            "Okay, cool.",
            "Let's move on.",
            "Great, okay.",
            "Alright, let's shift gears."
        ],
        "encouragement": [
            "I'd love to hear more about that.",
            "Can you elaborate a bit?",
            "Tell me more about the specifics."
        ]
    }

    # ==================== MAIN PROMPT TEMPLATES ====================

    @staticmethod
    def standard_question(
        role: str,
        difficulty: str,
        conversation_summary: str,
        question_intent: str,
        question_number: int
    ) -> str:
        """
        Generate a standard interview question prompt.

        Use this for regular progression through the interview when no special
        action (follow-up, challenge, etc.) is needed.

        Args:
            role: The job role being interviewed for (e.g., "Software Engineer")
            difficulty: Interview difficulty level (intern/junior/intermediate/senior/lead)
            conversation_summary: Summary of the conversation so far
            question_intent: Target assessment area (technical_skills, behavioral, etc.)
            question_number: Current question number in the interview (1-indexed)

        Returns:
            Formatted prompt string for LLM to generate a standard question

        Example:
            >>> prompt = PromptTemplates.standard_question(
            ...     role="Backend Developer",
            ...     difficulty="senior",
            ...     conversation_summary="Q1: Tell me about yourself...",
            ...     question_intent="problem_solving",
            ...     question_number=3
            ... )
        """
        difficulty_info = PromptTemplates.DIFFICULTY_GUIDANCE.get(
            difficulty.lower(),
            PromptTemplates.DIFFICULTY_GUIDANCE["intermediate"]
        )

        intent_desc = PromptTemplates.INTENT_DESCRIPTIONS.get(
            question_intent,
            question_intent.replace("_", " ")
        )

        # Get few-shot examples for this intent
        examples = PromptTemplates.FEW_SHOT_EXAMPLES.get(
            question_intent,
            PromptTemplates.FEW_SHOT_EXAMPLES.get("behavioral", [])
        )
        examples_text = "\n".join([f'- "{ex}"' for ex in examples[:3]])

        prompt = f"""You are conducting a professional interview for a {role} position.

## Interview Context
- **Difficulty Level**: {difficulty_info['level']}
- **Expected Candidate Profile**: {difficulty_info['expectations']}
- **Current Question Number**: {question_number}
- **Assessment Focus**: {question_intent} ({intent_desc})

## Conversation So Far
{conversation_summary if conversation_summary else "This is the first question - no prior conversation."}

## Your Task
Generate the next interview question that:

1. **Assesses {question_intent}** - Focus on evaluating {intent_desc}
2. **Matches {difficulty} level** - {difficulty_info['tone']}; avoid {difficulty_info['avoid']}
3. **Encourages STAR format** - The question should invite answers describing:
   - Situation: Context and background
   - Task: The challenge or responsibility
   - Action: Specific steps taken
   - Result: Measurable outcomes and learnings
4. **Is clear and professional** - Use direct, unambiguous language
5. **Avoids repetition** - Don't ask about topics already covered in the conversation

## Good Question Characteristics
- Starts with "Tell me about a time..." or "Describe a situation where..." for behavioral questions
- Asks "How would you approach..." for situational questions
- Uses "Walk me through..." for technical questions
- Is specific enough to get a focused answer
- Is open-ended enough to allow for detailed response

## Examples of High-Quality {question_intent.replace('_', ' ').title()} Questions
{examples_text}

Return ONLY the question text, nothing else. No preamble, no explanation."""

        return prompt

    @staticmethod
    def follow_up_question(
        last_question: str,
        last_answer: str,
        missing_elements: List[str],
        role: str
    ) -> str:
        """
        Generate a follow-up question prompt based on an incomplete or vague answer.

        Use this when the candidate's answer is missing key STAR elements,
        lacks specificity, or needs more detail.

        Args:
            last_question: The question that was just asked
            last_answer: The candidate's response that needs follow-up
            missing_elements: List of missing STAR elements or detail types
                             (e.g., ["specific actions", "measurable results"])
            role: The job role being interviewed for

        Returns:
            Formatted prompt string for LLM to generate a follow-up question

        Example:
            >>> prompt = PromptTemplates.follow_up_question(
            ...     last_question="Tell me about a challenging project",
            ...     last_answer="We worked on a big project and it was successful",
            ...     missing_elements=["specific actions", "measurable results", "your role"],
            ...     role="Software Engineer"
            ... )
        """
        missing_str = ", ".join(missing_elements) if missing_elements else "more specific details"

        # Get follow-up templates for examples
        follow_up_examples = "\n".join([f'- "{template}"' for template in PromptTemplates.FOLLOW_UP_TEMPLATES[:5]])

        prompt = f"""You are interviewing a candidate for a {role} position.

## Context
**Previous Question**: "{last_question}"

**Candidate's Answer**:
"{last_answer}"

## Analysis
The answer is incomplete or lacks detail. Specifically missing: **{missing_str}**

## Your Task
Generate a polite, professional follow-up question that:

1. **Probes for the missing elements** - Specifically asks about: {missing_str}
2. **Maintains rapport** - Is encouraging, not critical
3. **Is specific** - Clearly indicates what additional information you need
4. **Helps the candidate** - Guides them toward providing a better-structured answer

## Effective Follow-Up Patterns
Based on what's missing, consider these approaches:

- If missing **specific actions**: "Can you walk me through the specific steps YOU took?"
- If missing **measurable results**: "What was the quantifiable impact? Any metrics you can share?"
- If missing **your role**: "What was YOUR specific contribution vs. the team's?"
- If missing **situation context**: "Can you set the scene? What was the situation you faced?"
- If missing **challenges**: "What obstacles did you encounter along the way?"
- If missing **learnings**: "Looking back, what would you do differently?"

## Real Follow-Up Examples from Interviews
{follow_up_examples}

## Tone Guidelines
- Start with an acknowledgment: "Thanks for sharing that..." or "I'd love to hear more about..."
- Be curious, not interrogating
- Make it easy for them to elaborate

Return ONLY the follow-up question text, nothing else."""

        return prompt

    @staticmethod
    def referencing_question(
        topic: str,
        past_question_id: int,
        past_question_text: str,
        past_answer_excerpt: str,
        new_question_intent: str,
        role: str
    ) -> str:
        """
        Generate a question that explicitly references a past answer.

        Use this to create continuity in the interview and explore topics
        the candidate mentioned earlier in more depth.

        Args:
            topic: The specific topic from the past answer to explore
            past_question_id: The question number being referenced
            past_question_text: The original question that was asked
            past_answer_excerpt: Relevant excerpt from the candidate's past answer
            new_question_intent: The intent/focus of the new question
            role: The job role being interviewed for

        Returns:
            Formatted prompt string for LLM to generate a referencing question

        Example:
            >>> prompt = PromptTemplates.referencing_question(
            ...     topic="microservices architecture",
            ...     past_question_id=2,
            ...     past_question_text="Describe your experience with system design",
            ...     past_answer_excerpt="...we migrated to microservices which improved...",
            ...     new_question_intent="technical_skills",
            ...     role="Senior Backend Engineer"
            ... )
        """
        intent_desc = PromptTemplates.INTENT_DESCRIPTIONS.get(
            new_question_intent,
            new_question_intent.replace("_", " ")
        )

        prompt = f"""You are interviewing a candidate for a {role} position.

## Earlier in the Interview
**Question {past_question_id}**: "{past_question_text}"

**The candidate said**:
"{past_answer_excerpt}"

**Key topic mentioned**: {topic}

## Your Task
Generate a new question that:

1. **Explicitly references their earlier answer** about {topic}
2. **Explores {new_question_intent}** ({intent_desc}) in more depth
3. **Makes a natural connection** - Shows you were actively listening
4. **Digs deeper** - Goes beyond what they already shared

## Reference Patterns to Use
Start your question with one of these natural transitions:

- "Earlier you mentioned {topic}..."
- "You brought up {topic} when discussing [context]..."
- "Going back to what you said about {topic}..."
- "I'm curious to learn more about the {topic} you mentioned..."
- "You touched on {topic} earlier. Can you elaborate on..."

## Question Structure
1. Reference their past statement (1 sentence)
2. Ask a specific follow-on question that explores a new angle

## Example Format
"Earlier you mentioned {topic}. [Specific question about {new_question_intent} that builds on what they said]"

Return ONLY the question text with the reference. No preamble."""

        return prompt

    @staticmethod
    def contradiction_challenge(
        past_question_id: int,
        past_statement: str,
        current_question_id: int,
        current_statement: str,
        contradiction_type: str
    ) -> str:
        """
        Generate a tactful question to address a detected contradiction.

        Use this when the candidate has made statements that appear inconsistent.
        The goal is clarification, not accusation.

        Args:
            past_question_id: Question number of the earlier statement
            past_statement: The earlier statement that contradicts
            current_question_id: Question number of the current statement
            current_statement: The current contradicting statement
            contradiction_type: Type of contradiction (e.g., "work_preference",
                              "experience_level", "timeline", "values")

        Returns:
            Formatted prompt string for LLM to generate a tactful clarification question

        Example:
            >>> prompt = PromptTemplates.contradiction_challenge(
            ...     past_question_id=2,
            ...     past_statement="I thrive in collaborative team environments",
            ...     current_question_id=6,
            ...     current_statement="I prefer working independently without interruptions",
            ...     contradiction_type="work_preference"
            ... )
        """
        prompt = f"""You are a professional interviewer who has noticed an apparent inconsistency in a candidate's responses.

## The Contradiction
**In Question {past_question_id}**, the candidate said:
"{past_statement}"

**In Question {current_question_id}**, the candidate said:
"{current_statement}"

**Type of inconsistency**: {contradiction_type}

## Your Task
Generate a tactful clarification question that:

1. **Points out the inconsistency professionally** - Be factual, not accusatory
2. **Gives them a fair chance to clarify** - There may be context you're missing
3. **Maintains respect and rapport** - Assume good faith
4. **Invites explanation** - Use curious, open language

## Key Principles
- This is NOT about catching them in a lie
- People's preferences CAN be nuanced and context-dependent
- Your goal is to UNDERSTAND, not to trap
- The candidate may have valid reasons for the apparent contradiction

## Tactful Phrasing Options
- "I want to make sure I understand correctly. Earlier you mentioned [X], and just now you said [Y]. Can you help me see how these fit together?"
- "I noticed something interesting. In Q{past_question_id} you mentioned [X], but now [Y]. I'm curious how you balance these perspectives."
- "Help me reconcile something. You mentioned [X] before, and now [Y]. What's the context I might be missing?"
- "I'd love to understand better. You said [X] earlier, and [Y] just now. How do you think about these differently?"

## Tone
- Curious, not confrontational
- Respectful, not accusatory
- Open-minded, not judgmental
- Professional throughout

Return ONLY the clarification question. No preamble or explanation."""

        return prompt

    @staticmethod
    def deep_dive_question(
        topic: str,
        mention_count: int,
        previous_mentions: List[Dict[str, Any]],
        role: str
    ) -> str:
        """
        Generate a question to deeply explore a topic the candidate is passionate about.

        Use this when a topic has been mentioned multiple times, indicating
        strong interest or expertise that should be explored.

        Args:
            topic: The topic that has been mentioned multiple times
            mention_count: Number of times the topic was mentioned
            previous_mentions: List of dictionaries with question_id and excerpt
                              Example: [{"question_id": 1, "excerpt": "I love Python..."}]
            role: The job role being interviewed for

        Returns:
            Formatted prompt string for LLM to generate a deep dive question

        Example:
            >>> prompt = PromptTemplates.deep_dive_question(
            ...     topic="machine learning",
            ...     mention_count=4,
            ...     previous_mentions=[
            ...         {"question_id": 1, "excerpt": "I'm passionate about ML..."},
            ...         {"question_id": 3, "excerpt": "Used ML to predict..."},
            ...         {"question_id": 5, "excerpt": "My ML models achieved..."}
            ...     ],
            ...     role="Data Scientist"
            ... )
        """
        # Format the previous mentions
        mentions_text = ""
        for mention in previous_mentions[:5]:  # Limit to 5 mentions
            q_id = mention.get("question_id", "?")
            excerpt = mention.get("excerpt", "")[:150]  # Limit excerpt length
            mentions_text += f"\n- **Q{q_id}**: \"{excerpt}...\""

        prompt = f"""You are interviewing a candidate for a {role} position.

## Observation
The candidate has mentioned **"{topic}"** {mention_count} times throughout the interview.

## Where They Mentioned It
{mentions_text}

## Analysis
This repeated mention suggests:
- Strong passion or genuine interest in {topic}
- Significant experience or expertise in this area
- This may be a core strength worth exploring deeply

## Your Task
Generate a deep-dive question that:

1. **Acknowledges their passion** - Show you noticed their interest
2. **Probes their deepest expertise** - Go beyond surface-level
3. **Asks about complexity and challenge** - What's the hardest problem they've solved with {topic}?
4. **Shows genuine curiosity** - Make them feel their expertise is valued

## Deep-Dive Question Patterns
- "You've mentioned {topic} several times - I can tell it's important to you. What's the most complex problem you've tackled with it?"
- "I notice {topic} keeps coming up. Tell me about your proudest achievement involving {topic}."
- "You clearly have deep experience with {topic}. Walk me through a situation where that expertise made a critical difference."
- "Given your passion for {topic}, where do you see it heading in the next few years, and how are you preparing for that?"

## Real Deep-Dive Examples from Interviews
- "You've mentioned machine learning several times. What's the most challenging ML model you've deployed to production?"
- "I can tell AWS is your strength area. Walk me through a complex architecture you've designed and the trade-offs you considered."
- "You've brought up system design repeatedly. Tell me about your proudest infrastructure achievement."

## Question Characteristics
- Start by acknowledging their repeated mention
- Ask about their BEST or MOST CHALLENGING work
- Invite them to showcase their expertise
- Be genuinely interested in learning from their experience

## Tone
- Enthusiastic and curious
- Respectful of their expertise
- Inviting them to shine

Return ONLY the deep dive question text. No preamble."""

        return prompt

    @staticmethod
    def contextual_question(
        role: str,
        difficulty: str,
        conversation_summary: str,
        topics_discussed: List[str],
        question_intent: str,
        question_number: int,
        total_questions: int,
        special_instructions: Optional[str] = None
    ) -> str:
        """
        Generate a question with full conversation context.

        This is the main prompt for generating questions with rich context,
        used when comprehensive context awareness is needed.

        Args:
            role: The job role being interviewed for
            difficulty: Interview difficulty level
            conversation_summary: Full summary of conversation so far
            topics_discussed: List of topics already covered
            question_intent: Target assessment area for this question
            question_number: Current question number (1-indexed)
            total_questions: Total planned questions in the interview
            special_instructions: Optional additional instructions for generation

        Returns:
            Formatted prompt string for LLM with full context

        Example:
            >>> prompt = PromptTemplates.contextual_question(
            ...     role="Product Manager",
            ...     difficulty="senior",
            ...     conversation_summary="Q1: Background... A1: 8 years in PM...",
            ...     topics_discussed=["product strategy", "stakeholder management"],
            ...     question_intent="leadership",
            ...     question_number=5,
            ...     total_questions=10,
            ...     special_instructions="Focus on cross-functional leadership"
            ... )
        """
        difficulty_info = PromptTemplates.DIFFICULTY_GUIDANCE.get(
            difficulty.lower(),
            PromptTemplates.DIFFICULTY_GUIDANCE["intermediate"]
        )

        intent_desc = PromptTemplates.INTENT_DESCRIPTIONS.get(
            question_intent,
            question_intent.replace("_", " ")
        )

        # Get few-shot examples for this intent
        context_examples = PromptTemplates.FEW_SHOT_EXAMPLES.get(
            question_intent,
            PromptTemplates.FEW_SHOT_EXAMPLES.get("behavioral", [])
        )
        context_examples_text = "\n".join([f'- "{ex}"' for ex in context_examples[:3]])

        topics_str = ", ".join(topics_discussed) if topics_discussed else "None yet"

        # Calculate interview stage
        progress_pct = (question_number / total_questions) * 100
        if progress_pct <= 30:
            stage = "early (building rapport, exploring background)"
        elif progress_pct <= 70:
            stage = "middle (deep assessment, technical/behavioral probing)"
        else:
            stage = "late (wrapping up, final impressions, candidate questions)"

        special_section = ""
        if special_instructions:
            special_section = f"""
## Special Instructions
{special_instructions}
"""

        prompt = f"""You are conducting a {difficulty_info['level']} interview for a {role} position.

## Interview Progress
- **Question**: {question_number} of {total_questions} ({progress_pct:.0f}% complete)
- **Stage**: {stage}
- **Assessment Focus**: {question_intent} ({intent_desc})

## Difficulty Calibration
- **Level**: {difficulty_info['level']}
- **Expectations**: {difficulty_info['expectations']}
- **Tone**: {difficulty_info['tone']}
- **Avoid**: {difficulty_info['avoid']}

## Conversation Summary
{conversation_summary if conversation_summary else "This is the first question."}

## Topics Already Discussed
{topics_str}

**IMPORTANT**: Do NOT repeat or revisit these topics. Find new angles to explore.
{special_section}
## Your Task
Generate the next interview question that:

1. **Fits naturally** into the conversation flow at this stage
2. **Avoids repetition** - Covers NEW ground, not topics already discussed
3. **Assesses {question_intent}** - Evaluates {intent_desc}
4. **Matches {difficulty} level** - Appropriate challenge for {difficulty_info['level']}
5. **Encourages STAR responses** - Invites detailed, structured answers with:
   - Specific situations and context
   - Clear tasks and responsibilities
   - Concrete actions taken
   - Measurable results achieved
6. **Maintains professional tone** - {difficulty_info['tone']}

## Question Quality Checklist
- [ ] Is it specific enough to get a focused answer?
- [ ] Is it open-ended enough to allow for detail?
- [ ] Does it avoid yes/no responses?
- [ ] Is it relevant to the {role} position?
- [ ] Would a {difficulty} candidate find it appropriately challenging?

## Example High-Quality {question_intent.replace('_', ' ').title()} Questions
{context_examples_text}

Return ONLY the question text. No preamble, no numbering, no explanation."""

        return prompt

    @staticmethod
    def interviewer_comment(
        comment_type: str,
        context: Dict[str, Any]
    ) -> str:
        """
        Generate natural pre-question comments from the interviewer.

        These comments create conversational flow and show the interviewer
        is actively listening and engaging with the candidate's responses.

        Args:
            comment_type: Type of comment to generate. Options:
                         - "reference": Referencing something they said earlier
                         - "challenge": Introducing a clarification
                         - "deep_dive": Acknowledging their expertise/passion
                         - "transition": Shifting to a new topic
                         - "acknowledgment": Thanking for a good answer
                         - "encouragement": Encouraging more detail
            context: Dictionary with relevant context for the comment type.
                    Keys depend on comment_type:
                    - reference: {"topic": str, "question_id": int}
                    - challenge: {"contradiction_type": str}
                    - deep_dive: {"topic": str, "mention_count": int}
                    - transition: {"from_topic": str, "to_topic": str}
                    - acknowledgment: {"quality": str}  # "detailed", "insightful", etc.
                    - encouragement: {"missing": str}  # what's missing

        Returns:
            Formatted prompt string for LLM to generate a natural comment

        Example:
            >>> prompt = PromptTemplates.interviewer_comment(
            ...     comment_type="deep_dive",
            ...     context={"topic": "Kubernetes", "mention_count": 3}
            ... )
        """
        type_instructions = {
            "reference": """Generate a brief comment that references something the candidate said earlier.
Context: They mentioned "{topic}" in question {question_id}.
Example outputs:
- "Going back to what you mentioned earlier about {topic}..."
- "I was intrigued by your earlier point about {topic}."
- "You brought up {topic} before - I'd like to explore that."
""",
            "challenge": """Generate a brief, tactful comment to introduce a clarification question.
Context: You noticed a {contradiction_type} inconsistency in their answers.
Example outputs:
- "I want to make sure I understand correctly..."
- "Help me connect something from earlier..."
- "I noticed something interesting in your responses..."
Tone: Curious and non-accusatory, NOT confrontational.
""",
            "deep_dive": """Generate a comment acknowledging their clear interest/expertise in a topic.
Context: They've mentioned "{topic}" {mention_count} times.
Example outputs:
- "I can tell {topic} is really important to you."
- "You've brought up {topic} several times - you clearly have deep experience here."
- "I notice {topic} keeps coming up in your answers."
""",
            "transition": """Generate a natural transition comment between topics.
Context: Moving from {from_topic} to {to_topic}.
Example outputs:
- "Let's shift gears a bit."
- "I'd like to move on to a different area."
- "Switching topics slightly..."
- "Now I'd like to explore something different."
""",
            "acknowledgment": """Generate a brief acknowledgment of their previous answer.
Context: Their answer was {quality}.
Example outputs:
- "Thanks for that detailed response."
- "That's a great example."
- "I appreciate you sharing that."
- "That gives me good insight."
Keep it brief and genuine, not over-the-top.
""",
            "encouragement": """Generate a gentle encouragement for more detail.
Context: The answer was missing {missing}.
Example outputs:
- "I'd love to hear more about that."
- "Can you elaborate a bit?"
- "Tell me more about the specifics."
Tone: Encouraging and supportive.
"""
        }

        instructions = type_instructions.get(comment_type, type_instructions["acknowledgment"])

        # Format the instructions with context
        try:
            formatted_instructions = instructions.format(**context)
        except KeyError:
            formatted_instructions = instructions

        prompt = f"""You are an interviewer making a brief, natural comment before asking your next question.

## Comment Type: {comment_type}

{formatted_instructions}

## Guidelines
- Keep it SHORT (1-2 sentences max)
- Sound natural and conversational
- Don't be overly formal or robotic
- Don't be excessively complimentary
- Make it feel like a real human conversation

Return ONLY the comment text. No quotation marks, no explanation."""

        return prompt

    # ==================== HELPER METHODS ====================

    @staticmethod
    def _format_conversation_summary(answers: List[Dict[str, Any]]) -> str:
        """
        Format a list of Q&A pairs into a readable summary for prompts.

        Takes the raw answer data and formats it into a clean, readable
        summary that can be included in prompts for context.

        Args:
            answers: List of answer dictionaries, each containing:
                    - question_id: int
                    - question_text: str
                    - user_answer: str
                    - question_intent: str (optional)

        Returns:
            Formatted string with Q&A pairs, or message if no answers

        Example:
            >>> answers = [
            ...     {"question_id": 1, "question_text": "Tell me about yourself",
            ...      "user_answer": "I am a software engineer..."},
            ...     {"question_id": 2, "question_text": "Your Python experience?",
            ...      "user_answer": "I've worked with Python for 5 years..."}
            ... ]
            >>> summary = PromptTemplates._format_conversation_summary(answers)
            >>> print(summary)
            Q1: Tell me about yourself
            A1: I am a software engineer...

            Q2: Your Python experience?
            A2: I've worked with Python for 5 years...
        """
        if not answers:
            return "No previous conversation - this is the first question."

        formatted_parts = []

        for answer in answers:
            q_id = answer.get("question_id", "?")
            q_text = answer.get("question_text", "Question not recorded")
            a_text = answer.get("user_answer", "No answer recorded")
            intent = answer.get("question_intent", "")

            # Truncate very long answers to keep prompts manageable
            if len(a_text) > 500:
                a_text = a_text[:497] + "..."

            intent_note = f" [{intent}]" if intent else ""

            formatted_parts.append(f"**Q{q_id}{intent_note}**: {q_text}")
            formatted_parts.append(f"**A{q_id}**: {a_text}")
            formatted_parts.append("")  # Empty line between Q&A pairs

        return "\n".join(formatted_parts).strip()

    @staticmethod
    def _format_topics_list(topics: List[str]) -> str:
        """
        Format a list of topics into a readable string for prompts.

        Args:
            topics: List of topic strings

        Returns:
            Formatted string listing topics, or "None" if empty

        Example:
            >>> topics = ["Python", "system design", "leadership"]
            >>> PromptTemplates._format_topics_list(topics)
            'Python, system design, leadership'
        """
        if not topics:
            return "None discussed yet"

        # Clean up topics
        cleaned = [t.strip() for t in topics if t and t.strip()]

        if not cleaned:
            return "None discussed yet"

        # If many topics, summarize
        if len(cleaned) > 10:
            return ", ".join(cleaned[:10]) + f", and {len(cleaned) - 10} more"

        return ", ".join(cleaned)

    @staticmethod
    def _format_previous_mentions(mentions: List[Dict[str, Any]]) -> str:
        """
        Format previous topic mentions for deep dive prompts.

        Args:
            mentions: List of mention dictionaries with question_id and excerpt

        Returns:
            Formatted string listing where the topic was mentioned

        Example:
            >>> mentions = [
            ...     {"question_id": 1, "excerpt": "I love Python"},
            ...     {"question_id": 3, "excerpt": "Built it with Python"}
            ... ]
            >>> PromptTemplates._format_previous_mentions(mentions)
            '- Q1: "I love Python"\\n- Q3: "Built it with Python"'
        """
        if not mentions:
            return "No specific mentions recorded"

        formatted = []
        for mention in mentions[:5]:  # Limit to 5
            q_id = mention.get("question_id", "?")
            excerpt = mention.get("excerpt", "")[:100]  # Limit excerpt length
            if excerpt:
                formatted.append(f"- Q{q_id}: \"{excerpt}\"")

        return "\n".join(formatted) if formatted else "No specific mentions recorded"

    @staticmethod
    def opening_question(
        role: str,
        difficulty: str
    ) -> str:
        """
        Generate a prompt for the opening/introduction question.

        The first question of an interview - typically an ice-breaker
        that allows the candidate to introduce themselves.

        Args:
            role: The job role being interviewed for
            difficulty: Interview difficulty level

        Returns:
            Formatted prompt for generating an opening question

        Example:
            >>> prompt = PromptTemplates.opening_question(
            ...     role="Software Engineer",
            ...     difficulty="senior"
            ... )
        """
        difficulty_info = PromptTemplates.DIFFICULTY_GUIDANCE.get(
            difficulty.lower(),
            PromptTemplates.DIFFICULTY_GUIDANCE["intermediate"]
        )

        prompt = f"""You are starting an interview for a {role} position.

## Context
- **Position**: {role}
- **Level**: {difficulty_info['level']}
- This is the FIRST question - set a welcoming tone

## Your Task
Generate an opening interview question that:

1. **Creates a comfortable atmosphere** - Welcoming and professional
2. **Allows self-introduction** - Let them highlight their background
3. **Is open-ended** - Gives them freedom to share what's important to them
4. **Sets the stage** - Naturally leads into more specific questions later
5. **Is appropriate for {difficulty} level** - {difficulty_info['tone']}

## Good Opening Question Patterns
- "Tell me about yourself and what brings you to this {role} opportunity."
- "I'd love to hear about your background and what excites you about this role."
- "Walk me through your journey to this point and why this {role} position interests you."
- "Start by telling me about your relevant experience and what drew you to apply here."

## Real Opening Questions from Interviews
- "Can you introduce yourself briefly?"
- "How would you define yourself today? Based on your past experience, how do you see yourself right now?"
- "Why this role, and why now?"
- "Where are you currently, and what has you looking for your next opportunity?"

## Avoid
- Questions that are too specific or technical for an opener
- Yes/no questions
- Questions that might make them uncomfortable
- Anything too formal or intimidating

Return ONLY the opening question text. No preamble."""

        return prompt

    @staticmethod
    def closing_question(
        role: str,
        difficulty: str,
        conversation_summary: str
    ) -> str:
        """
        Generate a prompt for the closing question of the interview.

        The final question - typically asking if they have questions
        or giving them a chance for final thoughts.

        Args:
            role: The job role being interviewed for
            difficulty: Interview difficulty level
            conversation_summary: Summary of the conversation

        Returns:
            Formatted prompt for generating a closing question
        """
        prompt = f"""You are concluding an interview for a {role} position.

## Context
- **Position**: {role}
- **Difficulty**: {difficulty}
- This is the FINAL question

## Conversation Summary
{conversation_summary if conversation_summary else "Interview conversation completed."}

## Your Task
Generate a closing interview question that:

1. **Signals the interview is ending** - "Before we wrap up..."
2. **Gives them final opportunity** - To share anything not yet covered
3. **Invites their questions** - Standard "questions for me?" OR
4. **Allows final impression** - Something memorable they want to share

## Good Closing Question Patterns
- "Before we wrap up, is there anything else you'd like to share that we haven't covered?"
- "We're coming to the end of our time. What questions do you have for me about the role or team?"
- "Is there anything you wish I had asked, or something important you'd like to add?"
- "What final thoughts would you like to leave me with?"

Return ONLY the closing question text. No preamble."""

        return prompt


# Convenience aliases for common prompt types
StandardPrompt = PromptTemplates.standard_question
FollowUpPrompt = PromptTemplates.follow_up_question
ReferencingPrompt = PromptTemplates.referencing_question
ContradictionPrompt = PromptTemplates.contradiction_challenge
DeepDivePrompt = PromptTemplates.deep_dive_question
ContextualPrompt = PromptTemplates.contextual_question
CommentPrompt = PromptTemplates.interviewer_comment
