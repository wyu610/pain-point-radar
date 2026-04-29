import { getSetting } from '../../db/settings';
import { SettingsEditor } from './editor';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const sources = (await getSetting<unknown>('sources')) ?? {};
  const scoring = (await getSetting<unknown>('scoring')) ?? {};
  return (
    <section>
      <h2>Settings</h2>
      <p className="subtle">
        Edit and save the JSON below. The next scheduled run picks up changes — no redeploy needed.
      </p>
      <h3>Sources</h3>
      <SettingsEditor file="sources" initial={JSON.stringify(sources, null, 2)} />
      <h3 style={{ marginTop: '2rem' }}>Scoring</h3>
      <SettingsEditor file="scoring" initial={JSON.stringify(scoring, null, 2)} />
    </section>
  );
}
