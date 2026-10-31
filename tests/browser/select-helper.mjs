export async function openSyncOptions(page) {
  if (!await page.locator('#modal[data-sync-options]').isVisible()) await page.getByRole('button', { name: 'Sync options', exact: true }).click();
}

export async function closeSyncOptions(page) {
  if (await page.locator('#modal[data-sync-options]').isVisible()) await page.locator('#modal').getByRole('button', { name: 'Close dialog', exact: true }).click();
}

export async function chooseSelect(page, label, value) {
  if (['Sync source', 'X accounts'].includes(label)) {
    await openSyncOptions(page);
    const values = await page.locator('#sync-account-choices input:not([value="all"])').evaluateAll(inputs => inputs.map(input => input.value));
    const platforms = value === 'all' ? ['x', 'instagram', 'chrome'] : value === 'both' ? ['x', 'instagram'] : [value];
    for (const item of values) {
      const input = page.locator(`#sync-account-choices input[value="${item}"]`);
      if (label === 'Sync source' || item.startsWith('x:')) if (await input.count()) await input.setChecked(false);
    }
    const wanted = label === 'Sync source' ? values.filter(item => platforms.includes(item.split(':')[0]) && (item !== 'x:current' || !values.some(other => other.startsWith('x:@')))) : value === 'all' ? values.filter(item => item.startsWith('x:@')) : [`x:${value.toLowerCase()}`];
    for (const item of wanted) await page.locator(`#sync-account-choices input[value="${item}"]`).setChecked(true);
    await closeSyncOptions(page); return;
  }
  const native = page.locator(`select[aria-label="${label}"]`);
  const text = await native.locator('option').evaluateAll((options, value) => options.find(o => o.value === value)?.label, value);
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: text, exact: true }).click();
}
