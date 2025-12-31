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
              text: `Analyze this image of notes/meeting notes and extract all action items, tasks, and to-dos.

For each task found, provide:
- title: A clear, actionable task title
- assignee: The person assigned (if mentioned), or empty string
- dueDate: Any due date mentioned (in YYYY-MM-DD format if possible), or empty string
- isCritical: true if marked urgent/important/critical, false otherwise

Return ONLY a valid JSON array of tasks, no other text. Example format:
[
  {"title": "Review proposal document", "assignee": "Sarah", "dueDate": "2025-01-05", "isCritical": false},
  {"title": "Send update to client", "assignee": "", "dueDate": "", "isCritical": true}
]

If no tasks are found, return an empty array: []

Extract tasks from any format: handwritten notes, typed text, tables, bullet points, etc.`,
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
