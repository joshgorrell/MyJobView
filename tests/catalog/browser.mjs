import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const server=await createServer({configFile:'tests/catalog/browser/vite.config.mjs'});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  for(const width of [320,390,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5198');
    const group=(name)=>page.getByRole('button',{name:new RegExp('^'+name+' \\d+ products?$')});
    await group('Sony').waitFor();
    assert.equal(await group('Sony').getAttribute('aria-expanded'),'true');
    assert.equal(await group('Episode').count(),1);
    assert.equal(await group('Unassigned brand').count(),1);
    assert.equal(await group('Amazon').count(),0,'Vendor must never become a brand');
    assert.ok((await page.evaluate(()=>window.productSelect)).includes('manufacturers(name)'));
    await group('Sony').click();
    assert.equal(await group('Sony').getAttribute('aria-expanded'),'false');
    await group('Sony').click();
    assert.equal(await group('Sony').getAttribute('aria-expanded'),'true');
    assert.ok(await page.getByRole('button',{name:'Open TV-1',exact:true}).first().isVisible() || await page.getByText('TV-1',{exact:true}).last().isVisible());
    assert.ok((await page.locator(width<640 ? 'button[aria-label="Open TV-1"]:visible' : 'tbody tr:visible').filter({hasText:'TV-1'}).textContent()).includes('$0.00'),'Zero price must stay zero');
    await page.getByRole('button',{name:'Collapse all'}).click();
    await page.getByPlaceholder('Search products...').fill('Bedroom');
    await page.getByText('1 of 4 products',{exact:true}).waitFor();
    assert.equal(await group('Sony').getAttribute('aria-expanded'),'true','Description search must reveal collapsed matches');
    await group('Sony').click();assert.equal(await group('Sony').getAttribute('aria-expanded'),'false');
    await page.getByPlaceholder('Search products...').fill('Episode');
    await group('Episode').waitFor();assert.equal(await group('Episode').getAttribute('aria-expanded'),'true');
    await page.getByPlaceholder('Search products...').fill('');
    await page.getByRole('button',{name:'Filters',exact:true}).click();
    const vendor=page.locator('select').filter({has:page.locator('option[value="amazon"]')});
    assert.equal(await vendor.locator('option[value="amazon"]').textContent(),'Amazon');
    await vendor.selectOption('amazon');await page.getByRole('button',{name:'Apply',exact:true}).click();
    await page.getByText('1 of 4 products',{exact:true}).waitFor();assert.equal(await group('Sony').getAttribute('aria-expanded'),'true');
    await page.getByRole('button',{name:'Filters',exact:false}).first().click();
    await page.getByRole('button',{name:'Clear All',exact:true}).click();await page.getByRole('button',{name:'Apply',exact:true}).click();
    await page.getByText('3 of 4 products',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Filters',exact:true}).click();
    const brandFilter=page.locator('select').filter({has:page.locator('option[value="sony"]')});
    await brandFilter.selectOption('sony');await page.getByRole('button',{name:'Apply',exact:true}).click();
    await page.getByText('1 of 4 products',{exact:true}).waitFor();
    assert.equal(await group('Sony').getAttribute('aria-expanded'),'true');
    await page.getByRole('button',{name:/^Filters/}).click();await page.getByRole('button',{name:'Clear All',exact:true}).click();await page.getByRole('button',{name:'Apply',exact:true}).click();
    await page.getByText('3 of 4 products',{exact:true}).waitFor();
    await page.getByLabel('Group products by').selectOption('category');await group('Speakers').waitFor();
    await page.getByLabel('Group products by').selectOption('vendor');await group('Amazon').waitFor();
    await page.getByRole('button',{name:'Expand all'}).click();
    await page.getByTitle('Grid view').click();
    await page.getByText('Sony',{exact:true}).first().waitFor();
    await page.getByLabel('Group products by').selectOption('none');
    assert.equal(await page.locator('button[aria-expanded]').count(),0);
    await page.getByTitle('List view').click();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    assert.equal(overflow,false,`Catalog overflow at ${width}px`);
    const viewButton=page.locator('button[aria-label="Open TV-1"]:visible');
    await viewButton.click();await page.getByTestId('stub-product-id').filter({hasText:'a'}).waitFor();
    await page.getByRole('button',{name:'Close test details'}).click();
    if(width>=768){
      await page.getByLabel('Group products by').selectOption('brand');
      await page.getByRole('button',{name:'Expand all'}).click();
      const checkAlignment=async()=>{
        const columns=await page.locator('section table:visible').evaluateAll(tables=>tables.map(table=>[...table.querySelectorAll('thead th')].map(cell=>({x:cell.getBoundingClientRect().x,width:cell.getBoundingClientRect().width}))));
        assert.ok(columns.length>=3);
        for(const row of columns.slice(1))for(let i=0;i<row.length;i++){
          assert.ok(Math.abs(row[i].x-columns[0][i].x)<1,'Column starts must align between brands');
          assert.ok(Math.abs(row[i].width-columns[0][i].width)<1,'Column widths must match between brands');
        }
      };
      await checkAlignment();
      assert.equal(await group('Sony').locator('span').first().evaluate(el=>getComputedStyle(el).fontSize),'14px');
      await page.getByRole('button',{name:'Filters',exact:true}).click();
      await page.getByText('Hide cost column',{exact:true}).click();await page.getByRole('button',{name:'Apply',exact:true}).click();
      await checkAlignment();
      if(width===1440)await page.screenshot({path:'/tmp/mjv-catalog-aligned.png',fullPage:true});
    }
    if(width===390){await page.getByLabel('Group products by').selectOption('brand');await page.getByRole('button',{name:'Expand all'}).click();await page.screenshot({path:'/tmp/mjv-catalog-mobile.png',fullPage:true});}
    assert.deepEqual(errors,[]);console.log(`Catalog interactions and layout passed at ${width}px`);
    await page.close();
  }
  // Exercise status + category + search together in both presentations at phone/tablet sizes.
  for (const width of [320,390,768,1024,1440]) {
    const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<=1024});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5198/?lifecycle=1');
    await page.getByText('3 of 5 products',{exact:true}).waitFor();
    await page.getByLabel('Group products by').selectOption('none');
    for (const view of ['List view','Grid view']) {
      await page.getByTitle(view,{exact:true}).click();
      for (const [status,visible,hidden] of [
        ['current',['TV-1','ES-1','MISC-ITEM'],['TV-2','OLD-TV']],
        ['discontinued',['TV-2'],['TV-1','ES-1','MISC-ITEM','OLD-TV']],
        ['archived',['OLD-TV'],['TV-1','TV-2','ES-1','MISC-ITEM']],
        ['all',['TV-1','TV-2','ES-1','MISC-ITEM','OLD-TV'],[]],
      ]) {
        await page.getByLabel('Catalog status').selectOption(status);
        await page.getByText(`${visible.length} of 5 products`,{exact:true}).waitFor();
        for (const sku of visible) await page.getByRole('button',{name:`Open ${sku}`,exact:true}).waitFor();
        for (const sku of hidden) await page.getByRole('button',{name:`Open ${sku}`,exact:true}).waitFor({state:'hidden'});
        await page.getByPlaceholder('Search products...').fill('television');
        await page.getByText(`${visible.filter(sku=>['TV-1','TV-2','OLD-TV'].includes(sku)).length} of 5 products`,{exact:true}).waitFor();
        for(const sku of ['ES-1','MISC-ITEM']) assert.equal(await page.getByRole('button',{name:`Open ${sku}`,exact:true}).count(),0);
        await page.getByPlaceholder('Search products...').fill('');
        await page.getByText(`${visible.length} of 5 products`,{exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${view}/${status} overflow at ${width}`);
      }
      await page.getByLabel('Catalog status').selectOption('current');
      await page.getByRole('button',{name:'Filters',exact:true}).click();
      const category=page.locator('select').filter({has:page.locator('option', {hasText:'All Categories'})});
      await category.selectOption('Speakers');
      const subcategory=page.locator('select').filter({has:page.locator('option', {hasText:'All Subcategories'})});
      await subcategory.selectOption('In-ceiling');
      await page.getByRole('button',{name:'Apply',exact:true}).click();
      await page.getByText('1 of 5 products',{exact:true}).waitFor();
      assert.ok(await page.getByRole('button',{name:'Open ES-1',exact:true}).isVisible());
      await page.getByRole('button',{name:'Open ES-1',exact:true}).click();
      await page.getByTestId('stub-product-id').filter({hasText:'c'}).waitFor();
      await page.getByRole('button',{name:'Close test details'}).click();
      await page.getByLabel('Catalog status').selectOption('discontinued');
      await page.getByText('0 of 5 products',{exact:true}).waitFor();
      assert.ok(await page.getByRole('button',{name:'In-ceiling',exact:false}).isVisible(),'Category filters persist across status');
      await page.getByLabel('Active product filters').getByRole('button',{name:'Clear filters',exact:true}).click();
      await page.getByText('1 of 5 products',{exact:true}).waitFor();
      await page.getByLabel('Catalog status').selectOption('current');
    }
    assert.deepEqual(errors,[]);await page.close();
    console.log(`Status, search, in-ceiling browsing and detail interactions passed in list/grid at ${width}px`);
  }
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto('http://127.0.0.1:5198/?lifecycle=1');
  await page.getByText('3 of 5 products',{exact:true}).waitFor();
  await page.getByLabel('Group products by').selectOption('none');
  assert.equal(await page.getByRole('button',{name:/^View /}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Open TV-2',exact:true}).count(),0,'Discontinued products hidden by default');
  assert.equal(await page.getByRole('button',{name:'Open OLD-TV',exact:true}).count(),0);
  const row=page.locator('tbody tr').filter({hasText:'TV-1'});
  await row.getByRole('button',{name:'Archive TV-1',exact:true}).click();
  await page.getByRole('button',{name:'Archive',exact:true}).click();
  await page.getByText('2 of 5 products',{exact:true}).waitFor();
  await page.getByLabel('Catalog status').selectOption('archived');
  await page.getByRole('button',{name:'Open OLD-TV',exact:true}).waitFor();
  await page.locator('tbody tr').filter({hasText:'TV-1'}).getByRole('button',{name:'Restore TV-1',exact:true}).click();
  await page.getByRole('button',{name:'Restore',exact:true}).click();
  await page.getByText('1 of 5 products',{exact:true}).waitFor();
  await page.getByLabel('Catalog status').selectOption('current');
  await page.getByText('3 of 5 products',{exact:true}).waitFor();
  await page.locator('tbody tr').filter({hasText:'TV-1'}).getByRole('button',{name:'Delete TV-1',exact:true}).click();
  await page.getByRole('button',{name:'Delete',exact:true}).click();
  await page.getByText('Product is in use',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByPlaceholder('Search products...').fill('Bedroom');
  await page.getByLabel('Catalog status').selectOption('discontinued');
  assert.equal(await page.getByPlaceholder('Search products...').inputValue(),'Bedroom','Status changes preserve search');
  assert.ok((await page.getByLabel('Catalog status').textContent()).includes('Discontinued — to archive (1)'));
  assert.equal(await page.getByRole('button',{name:'Open TV-2',exact:true}).count(),0,'Search continues to narrow discontinued results');
  await page.getByPlaceholder('Search products...').fill('');
  await page.getByRole('button',{name:'Open TV-2',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Open TV-1',exact:true}).count(),0);
  await page.close();console.log('Archive, restore, discontinued filters and protected-delete recovery passed.');
}finally{await browser.close();await server.close();}
