import { runDaily } from './report/daily';
import { runWeekly } from './report/weekly';

const cmd = process.argv[2];

async function main() {
  switch (cmd) {
    case 'daily': {
      const r = await runDaily();
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case 'weekly': {
      const r = await runWeekly();
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    default:
      console.error('usage: tsx src/cli.ts {daily|weekly}');
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
