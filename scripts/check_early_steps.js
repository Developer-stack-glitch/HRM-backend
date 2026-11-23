const fs = require('fs');
const readline = require('readline');

async function search() {
  const rl = readline.createInterface({ 
    input: fs.createReadStream('C:/Users/dell/.gemini/antigravity/brain/74cf5204-2c4b-4ed6-a077-20bd7edea355/.system_generated/logs/transcript.jsonl') 
  });

  for await (const line of rl) {
    try {
      const d = JSON.parse(line);
      if (d.step_index >= 30 && d.step_index <= 80 && d.type === 'PLANNER_RESPONSE') {
        console.log(`Step ${d.step_index}:`, (d.content || d.thinking || '').slice(0, 300));
        if (d.tool_calls) console.log('Tools:', d.tool_calls.map(t => t.name));
      }
    } catch (e) {}
  }
}

search().catch(console.error);
