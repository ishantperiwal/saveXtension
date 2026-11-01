import { test, expect } from '@playwright/test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

test('Settings enables local MCP, copies client setup, reflects LLM topic edits and blocks archived saves',async({page,context,request})=>{
  const origin='http://localhost:3211';
  const post=async(path,data)=>request.post(`${origin}${path}`,{headers:{Origin:origin},data});
  await post('/api/mcp',{enabled:false});
  await page.route('https://**/*',route=>route.abort());
  await post('/api/posts/import',{posts:[{platform:'chrome',url:'https://example.org/mcp-ui-reference',bookmarkTitle:'MCP reference',notes:'Keep this manual note'}]});
  await page.goto('/');
  await page.getByRole('button',{name:'Settings & backups',exact:true}).click();
  const toggle=page.getByRole('switch',{name:'Enable MCP server'});
  await expect(toggle).not.toBeChecked();await expect(page.getByRole('textbox',{name:'MCP server URL'})).toBeHidden();
  await toggle.check();await expect(page.getByRole('textbox',{name:'MCP server URL'})).toHaveValue(`${origin}/mcp`);
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.getByRole('button',{name:'Copy URL',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(`${origin}/mcp`);
  await page.getByText('Connect a client',{exact:true}).click();
  await page.getByRole('combobox',{name:'MCP client'}).click();await page.getByRole('option',{name:'Codex',exact:true}).click();
  await expect(page.locator('#mcp-client-config')).toHaveText(`codex mcp add savextension --url ${origin}/mcp`);
  await page.getByRole('button',{name:'Copy setup',exact:true}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(`codex mcp add savextension --url ${origin}/mcp`);
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
    await page.getByRole('button',{name:'Settings & backups',exact:true}).click();await expect(toggle).toBeChecked();await toggle.uncheck();await expect(page.getByRole('textbox',{name:'MCP server URL'})).toBeHidden();
  }finally{await client.close();await post('/api/mcp',{enabled:false});}
});
