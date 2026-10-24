const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function uploadAssets() {
  const heroBuffer = fs.readFileSync('public/wallet_hero_card.png');
  const logoBuffer = fs.readFileSync('public/wallet_logo_canelo.png');

  console.log('Subiendo hero_card a Supabase Storage...');
  const { data: heroData, error: heroErr } = await supabase.storage
    .from('wallet-assets')
    .upload('hero_card_canelo.png', heroBuffer, {
      contentType: 'image/png',
      upsert: true
    });
  
  if (heroErr) console.error('Error hero:', heroErr);
  else console.log('✅ Hero card subida:', heroData);

  console.log('Subiendo logo a Supabase Storage...');
  const { data: logoData, error: logoErr } = await supabase.storage
    .from('wallet-assets')
    .upload('logo_canelo.png', logoBuffer, {
      contentType: 'image/png',
      upsert: true
    });

  if (logoErr) console.error('Error logo:', logoErr);
  else console.log('✅ Logo subido:', logoData);

  const { data: heroUrl } = supabase.storage.from('wallet-assets').getPublicUrl('hero_card_canelo.png');
  const { data: logoUrl } = supabase.storage.from('wallet-assets').getPublicUrl('logo_canelo.png');

  console.log('\n--- URLs PÚBLICAS HTTPS OFICIALES PARA GOOGLE WALLET ---');
  console.log('HERO_URL:', heroUrl.publicUrl);
  console.log('LOGO_URL:', logoUrl.publicUrl);
}

uploadAssets();
