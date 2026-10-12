import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('search banners distinguish empty, duplicate and contact results; admin starts in loading state', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Discovery } = await vite.ssrLoadModule('/src/components/DiscoveryView.jsx');
    const props = { businessType: 'Spice importer', city: 'Hamburg', country: 'Germany', count: 10 };
    const render = info => renderToStaticMarkup(React.createElement(Discovery, { ...props, lastSearchInfo: info }));
    const empty = render({ count: 0, duplicatesSkipped: 0 });
    assert.match(empty, /No new contacts found/);
    assert.doesNotMatch(empty, /Search complete|Saved|Zero duplicates|Verified B2B/);
    assert.match(render({ count: 0, duplicatesSkipped: 2 }), /Already in Your CRM/);
    assert.match(render({ count: 0, duplicatesSkipped: 0, contactsMissing: 3 }), /No published contact details found/);
    const success = render({ count: 2, duplicatesSkipped: 0 });
    assert.match(success, /Search complete/);
    assert.match(success, /new contacts to your CRM/);
    const { default: Admin } = await vite.ssrLoadModule('/src/components/SuperadminView.jsx');
    const admin = renderToStaticMarkup(React.createElement(Admin, {}));
    assert.match(admin, /Loading administration/);
    assert.doesNotMatch(admin, /100% Operational/);
    const { default: Leads } = await vite.ssrLoadModule('/src/components/LeadsView.jsx');
    const leads = renderToStaticMarkup(React.createElement(Leads, { allLeads: [
      { id: 'phone', name: 'Phone Buyer', source: 'live', phone: '+49 12345678', phoneStatus: 'valid' },
      { id: 'mx', name: 'Scraped Buyer', source: 'live', email: 'sales@buyer.example', emailStatus: 'mx_valid' },
      { id: 'email', name: 'Email Buyer', source: 'live', email: 'buyer@example.test', emailStatus: 'unknown' },
    ] }));
    assert.match(leads, /Phone Buyer/);
    assert.match(leads, /Email Buyer/);
    assert.match(leads, /Published \/ MX confirmed/);
  } finally {
    await vite.close();
  }
});
