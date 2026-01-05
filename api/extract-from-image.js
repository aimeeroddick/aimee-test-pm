import Anthropic from '@anthropic-ai/sdk';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, mediaType } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'No image provided' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image,
              },
            },
            {
              type: 'text',
              text: `Analyze this image of meeting notes and extract ONLY clear action items.

WHAT TO EXTRACT (action items):
- "[Name] to [action]" (e.g., "Dave to send links")
- "[Name] will [action]" (e.g., "Sarah will review")
- "[Name]: [action]" or "@[Name] [action]"
- Clear commitments with a person's name AND an action verb

WHAT NOT TO EXTRACT:
- Future agenda items ("will discuss next time", "on the agenda for next meeting")
- Status updates ("project on track", "VFS going well")
- Meeting summaries ("met with Dave to discuss projects")
- General notes or observations without a clear assignee and action
- Decisions made ("agreed to use vendor X") - unless there's a follow-up action

EXAMPLES:
✅ "Dave to send links to team" → Extract
✅ "Sarah will review budget by Friday" → Extract
✅ "@John schedule follow-up" → Extract
❌ "Will determine date at next meeting" → NOT a task (future agenda)
❌ "Project status: on track" → NOT a task (status update)
❌ "Discussed timeline with stakeholders" → NOT a task (summary)
❌ "Good progress on phase 1" → NOT a task (observation)

For each action item found, provide:
- title: A clear, actionable task title (the action to be done)
- assignee: The person assigned to do it
- dueDate: Any due date mentioned (in YYYY-MM-DD format), or empty string if none
- isCritical: true if marked urgent/important/critical, false otherwise
- confidence: Your confidence this is a real action item (0.5-1.0, where 0.8+ means very confident)

Return ONLY a valid JSON array, no other text. Example:
[
  {"title": "Send links to team", "assignee": "Dave", "dueDate": "2025-01-03", "isCritical": false, "confidence": 0.95},
  {"title": "Setup meeting time for next week", "assignee": "Aimee", "dueDate": "", "isCritical": false, "confidence": 0.85}
]

If no action items are found, return: []`,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response format' });
    }

    // Parse the JSON response
    let tasks;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        tasks = JSON.parse(jsonMatch[0]);
      } else {
        tasks = JSON.parse(content.text);
      }
    } catch (parseError) {
      console.error('Failed to parse response:', content.text);
      return res.status(500).json({ error: 'Failed to parse extracted tasks', raw: content.text });
    }

    return res.status(200).json({ tasks });
  } catch (error) {
    console.error('Anthropic API error:', error);
    return res.status(500).json({ error: error.message || 'Failed to process image' });
  }
}
