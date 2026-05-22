import chromium from 'chromium';
import { Browser } from 'playwright';

(async () => {
  let browser;
  try {
    // Launch browser
    const executablePath = await chromium.executablePath();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Set viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Navigate to app
    console.log('📍 Navigating to app...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => {
      console.log('⚠️  Page load timeout (may be expected if not logged in)');
    });
    
    // Take initial screenshot
    await page.screenshot({ path: 'step1-initial.png' });
    console.log('✅ Step 1: App loaded - screenshot saved');
    
    // Check if we're on login or main page
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Try to find and click a task element
    // Look for any element that might open a task modal
    const taskLinks = await page.locator('[data-testid*="task"], [class*="task"], a:has-text("فعالیت")').all().catch(() => []);
    console.log(`Found ${taskLinks.length} potential task elements`);
    
    if (taskLinks.length > 0) {
      console.log('🔍 Clicking first task element...');
      await taskLinks[0].click().catch(() => console.log('Could not click task'));
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'step2-task-clicked.png' });
      console.log('✅ Step 2: Task clicked - screenshot saved');
    }
    
    // Look for modal or assignee dropdown
    const modalOrForm = await page.locator('[role="dialog"], .ant-modal, form').first();
    if (modalOrForm) {
      console.log('🔍 Modal/Form found');
      await page.screenshot({ path: 'step3-modal-open.png' });
      
      // Look for assignee field
      const assigneeField = await page.locator('input[placeholder*="مسئول"], input[placeholder*="انتخاب"], [label*="مسئول"]').first();
      if (assigneeField) {
        console.log('🔍 Assignee field found, clicking...');
        await assigneeField.click().catch(() => console.log('Could not click assignee field'));
        await page.waitForTimeout(1000);
        
        // Check if dropdown has options
        const dropdownItems = await page.locator('[class*="dropdown"], [class*="select"], [role="option"]').count();
        console.log(`📊 Found ${dropdownItems} dropdown items`);
        
        if (dropdownItems > 0) {
          console.log('✅ Step 3: Assignee dropdown populated - Options found!');
        } else {
          console.log('❌ Step 3: Assignee dropdown is EMPTY');
        }
        
        await page.screenshot({ path: 'step4-assignee-dropdown.png' });
      } else {
        console.log('⚠️  Could not find assignee field');
      }
    } else {
      console.log('⚠️  No modal or form found');
    }
    
    await context.close();
    await browser.close();
    console.log('\n✅ Verification complete');
    
  } catch (error) {
    console.error('Error:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
