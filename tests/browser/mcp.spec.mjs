import { test, expect } from '@playwright/test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';


test('Settings enables local MCP, copies a universal connection prompt, reflects LLM topic edits and blocks archived saves',async({page,context,request})=>{
  const origin='http://localhost:3211';
  const post=async(path,data)=>request.post(`${origin}${path}`,{headers:{Origin:origin},data});
  await post('/api/mcp',{enabled:false});
  await page.route('https://**/*',route=>route.abort());
  await post('/api/posts/import',{posts:[{platform:'chrome',url:'https://example.org/mcp-ui-reference',bookmarkTitle:'MCP reference',notes:'Keep this manual note'}]});
  await page.goto('/');
  await page.getByRole('button',{name:'Settings & backups',exact:true}).click();
  const toggle=page.getByRole('switch',{name:'Enable MCP server'});
  await expect(toggle).not.toBeChecked();await expect(page.getByRole('group',{name:'Copy a connection prompt'})).toBeHidden();
  await toggle.check();await expect(page.getByRole('group',{name:'Copy a connection prompt'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'MCP server URL'})).toHaveCount(0);
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await expect(page.getByRole('group', { name:'Copy a connection prompt' })).toBeVisible();
  const copyButton = page.getByRole('button', {name:'Copy connection prompt',exact:true});
  await expect(page.getByRole('group', { name:'Copy a connection prompt' }).getByRole('button')).toHaveCount(1);
  await expect(page.locator('#mcp-details')).not.toContainText('Paste into');
  await copyButton.click();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('Connect this AI app');
  const prompt = await page.evaluate(()=>navigator.clipboard.readText());
  expect(prompt).toContain(`${origin}/mcp`); expect(prompt).toContain('library_overview');
  expect(prompt).toContain('Streamable HTTP');
  expect(prompt).toContain('Do not modify my saves, topics or notes');
  expect(prompt).toContain('preserving all other MCP servers');
  expect(prompt).toContain('installed version'); expect(prompt).toContain('DeepSeek');
  expect(prompt).toContain('my selected model does not need to change');
  expect(prompt).toContain('If you cannot edit its configuration');
  // The actual clipboard must carry the runtime acceptance gates even when the
  // receiving harness cannot read our repository checklist.
  const gates=['1. Identify the client.','2. Establish the schema before writing.','3. Make the minimal change.','4. Validate the saved configuration.','5. Verify registration.','6. Verify through this client.','7. Report evidence, not a success assumption.'];
  const positions=gates.map(gate=>prompt.indexOf(gate));
  expect(positions.every(position=>position>=0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a,b)=>a-b));
  expect(prompt).toContain('minimal remote Streamable HTTP MCP example');
  expect(prompt).toContain('object map, wrapped object map, or patch-operation list');
  expect(prompt).toContain('Timebox discovery to two minutes');
  expect(prompt).toContain('Within 60 seconds');
  expect(prompt).toContain('A missing tool is a registration failure');
  expect(prompt).toContain('using the target client\'s MCP tooling in the active session');
  expect(prompt).toContain('A direct HTTP request, curl check, separate SDK connection');
  expect(prompt).toContain('Configured; verification pending');
  expect(prompt).toContain('unless I explicitly stop you');
  await expect(copyButton).not.toHaveClass(/is-copied/);
  await expect(copyButton).toHaveAttribute('aria-label', 'Copy connection prompt');
  await expect(page.locator('#toast')).toContainText('Connection copied');
  await expect(page.locator('#toast .toast-detail')).toHaveText('Paste into any MCP-compatible AI app on this computer.');
  await expect(page.locator('#toast')).toHaveClass(/bottom-center/);
  expect(await page.locator('#toast').evaluate(el=>{const r=el.getBoundingClientRect();return el.matches(':popover-open')&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;})).toBe(true);
  await expect(page.getByText('Manual setup',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Copy URL',exact:true})).toHaveCount(0);
  await page.screenshot({path:'test-results/mcp-settings-desktop.png'});
  await page.setViewportSize({width:390,height:844});await expect(toggle).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'test-results/mcp-settings-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});
  const client=new Client({name:'browser-test',version:'1'});
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)));
    const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});expect(r.isError).not.toBeTruthy();return r.structuredContent||JSON.parse(r.content[0].text);};
    const created=await call('create_topic',{name:'UI test collection',description:'Created by an MCP client'});
    const found=await call('get_save_by_url',{url:'https://example.org/mcp-ui-reference',platform:'chrome'}),id=found.saves[0].id;
    await call('set_save_topics',{postIds:[id],topicIds:[created.topic.id],mode:'replace'});
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    await expect(page.locator(`.save-card[data-post-id="${id}"] .tag`)).toHaveText('UI test collection',{timeout:7000});
    await page.getByRole('button',{name:/Filters/}).click();await expect(page.getByRole('checkbox',{name:'UI test collection',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    await page.locator(`.save-card[data-post-id="${id}"]`).getByRole('button',{name:'Archive save'}).click();
    const hidden=await client.callTool({name:'get_saves',arguments:{postIds:[id]}});expect(hidden.isError).toBeTruthy();
    await page.getByRole('button',{name:'Settings & backups',exact:true}).click();await expect(toggle).toBeChecked();await page.reload();
    await page.getByRole('button',{name:'Settings & backups',exact:true}).click();await expect(toggle).toBeChecked();await toggle.uncheck();await expect(page.getByRole('group',{name:'Copy a connection prompt'})).toBeHidden();
  }finally{await client.close();await post('/api/mcp',{enabled:false});}
});


test('clipboard fallback copies prompts without exposing configuration, and failures use a bottom toast',async({page,context})=>{
  await page.route('**/api/posts?scope=all',route=>route.fulfill({json:{posts:[],runs:[]}}));
  await page.route('**/api/mcp',route=>route.fulfill({json:{available:true,enabled:true,url:'http://localhost:4567/mcp'}}));
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.addInitScript(()=>{navigator.clipboard.writeText=async()=>{throw new Error('Clipboard unavailable');};window.readCopied=()=>navigator.clipboard.readText();});
  await page.goto('/');await page.getByRole('button',{name:'Settings & backups',exact:true}).click();
  const chip=page.getByRole('button',{name:'Copy connection prompt',exact:true});
  await chip.click();
  await expect.poll(()=>page.evaluate(()=>window.readCopied())).toContain('http://localhost:4567/mcp');
  await expect(page.locator('#toast')).toContainText('Connection copied');
  await expect(page.locator('#toast .toast-detail')).toHaveText('Paste into any MCP-compatible AI app on this computer.');
  await expect(page.locator('#modal textarea,#modal pre,#modal #mcp-url')).toHaveCount(0);
  await page.evaluate(()=>document.execCommand=()=>false);
  await chip.click();await expect(page.locator('#toast')).toHaveText('Couldn’t copy. Try again.');
  await expect(page.locator('#toast')).toHaveClass(/error.*bottom-center/);
  await expect(page.locator('#toast .toast-detail')).toHaveCount(0);
  await expect(page.locator('#modal textarea,#modal pre')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('desktop connection button uses native clipboard and keeps feedback in the toast',async({page})=>{
  await page.addInitScript(()=>{window.saveXDesktop={copyText:async value=>{window.copiedPrompt=value;}};});
  await page.route('**/api/mcp',r=>r.fulfill({json:{available:true,enabled:true,url:'http://localhost:3211/mcp'}}));
  await page.goto('/');await page.getByRole('button',{name:'Settings & backups',exact:true}).click();
  await page.getByRole('button',{name:'Copy connection prompt',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.copiedPrompt)).toContain('Connect this AI app');
  await expect(page.locator('#toast')).toContainText('Connection copied');
  await expect(page.locator('#toast .toast-detail')).toHaveText('Paste into any MCP-compatible AI app on this computer.');
  await expect(page.getByRole('button',{name:'Copy connection prompt',exact:true})).not.toHaveClass(/is-copied/);
});
