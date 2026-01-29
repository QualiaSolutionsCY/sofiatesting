import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://vceeheaxcrhmpqueudqx.supabase.co';
const supabaseKey = readFileSync('.env.local', 'utf-8')
  .split('\n')
  .find(line => line.startsWith('SUPABASE_SERVICE_ROLE_KEY'))
  ?.split('=')[1]
  ?.replace(/"/g, '')
  ?.trim();

if (!supabaseKey) {
  throw new Error('Could not find SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const templatesContent = readFileSync('/tmp/templates_content.txt', 'utf-8');

async function main() {
  console.log('Task 1: Insert templates content into sophia_prompts table');
  console.log('Checking for existing templates key...\n');
  
  const { data: existing, error: checkError } = await supabase
    .from('sophia_prompts')
    .select('key, priority, is_active')
    .eq('key', 'templates')
    .maybeSingle();
  
  if (checkError) {
    console.error('Error checking:', checkError);
    throw checkError;
  }
  
  if (existing) {
    console.log('✓ Templates key already exists in database:');
    console.log('  Key:', existing.key);
    console.log('  Priority:', existing.priority);
    console.log('  Active:', existing.is_active);
    console.log('\nSkipping insert - templates already migrated');
    return;
  }
  
  console.log('Templates key not found, inserting...');
  console.log(`Content size: ${templatesContent.length} characters (~68KB)\n`);
  
  const { data, error } = await supabase
    .from('sophia_prompts')
    .insert({
      key: 'templates',
      content: templatesContent,
      category: 'templates',
      description: 'All 43 document templates for Cyprus real estate communications',
      priority: 80,
      is_active: true,
      updated_by: 'migration-08-02',
      version: 1,
      is_current: true
    })
    .select('key, priority, is_active, id')
    .single();
  
  if (error) {
    console.error('Error inserting:', error);
    throw error;
  }
  
  console.log('✓ Templates inserted successfully!');
  console.log('  ID:', data.id);
  console.log('  Key:', data.key);
  console.log('  Priority:', data.priority);
  console.log('  Active:', data.is_active);
  console.log('  Content length:', templatesContent.length, 'chars');
  
  // Verify
  console.log('\nVerifying insertion...');
  const { data: verify, error: verifyError } = await supabase
    .from('sophia_prompts')
    .select('key, priority, is_active')
    .eq('key', 'templates')
    .single();
  
  if (verifyError) {
    console.error('Verification failed:', verifyError);
    throw verifyError;
  }
  
  console.log('✓ Verification passed:', verify);
}

main().then(() => {
  console.log('\n=== Task 1 Complete ===');
  process.exit(0);
}).catch(err => {
  console.error('\n✗ Task 1 Failed:', err.message);
  process.exit(1);
});
