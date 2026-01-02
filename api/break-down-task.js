import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { taskTitle, taskDescription, projectName } = req.body;

  if (!taskTitle) {
    return res.status(400).json({ error: 'No task title provided' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const contextParts = [];
    if (projectName) contextParts.push(`Project: ${projectName}`);
    if (taskDescription) contextParts.push(`Description: ${taskDescription}`);
    const context = contextParts.length > 0 ? `\n\nContext:\n${contextParts.join('\n')}` : '';

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Break down this task into 3-5 smaller, actionable subtasks.

Task: "${taskTitle}"${context}

Guidelines:
- Each subtask should be a concrete, actionable step
- Start each with a verb (e.g., "Draft", "Review", "Schedule", "Create")
- Keep them concise but clear
- Order them logically (what needs to happen first)
- Don't include the original task as a subtask

Return ONLY a valid JSON array of strings, no other text. Example:
["Research competitor pricing", "Draft initial proposal", "Review with team", "Send to client for feedback"]`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response format' });
    }

    let subtasks;
    try {
      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        subtasks = JSON.parse(jsonMatch[0]);
      } else {
        subtasks = JSON.parse(content.text);
      }
    } catch (parseError) {
      console.error('Failed to parse response:', content.text);
      return res.status(500).json({ error: 'Failed to parse subtasks', raw: content.text });
    }

    return res.status(200).json({ subtasks });
  } catch (error) {
    console.error('Anthropic API error:', error);
    return res.status(500).json({ error: error.message || 'Failed to break down task' });
  }
}
