const fs = require('fs');
const readline = require('readline');

async function search() {
  const rl = readline.createInterface({ 
    input: fs.createReadStream('C:/Users/dell/.gemini/antigravity/brain/74cf5204-2c4b-4ed6-a077-20bd7edea355/.system_generated/logs/transcript.jsonl') 
  });

  for await (const line of rl) {
    if (line.includes('ssh') || line.includes('scp') || line.includes('pm2') || line.includes('git push')) {
      try {
        const d = JSON.parse(line);
        const calls = d.tool_calls || [];
        for (const c of calls) {
          if (c.name === 'run_command') {
            console.log('CMD:', c.args.CommandLine);
          }
        }
      } catch (e) {}
    }
  }
}

search().catch(console.error);
