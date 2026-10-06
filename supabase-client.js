window.SupabaseApp = (() => {
  const config = window.SUPABASE_CONFIG || {};
  const key = config.publishableKey;
  const isConfigured = key && key.startsWith('sb_publishable_');
  const client = isConfigured && window.supabase?.createClient
    ? window.supabase.createClient(config.url, key)
    : null;

  async function loadProfile(userId) {
    if (!client) return { data: null, error: new Error('Supabase is not configured.') };
    return client
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .maybeSingle();
  }

  async function saveProfile(userId, preferences) {
    if (!client) return { error: new Error('Supabase is not configured.') };
    return client
      .from('profiles')
      .upsert({
        id: userId,
        preferences,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
  }

  return { client, loadProfile, saveProfile };
})();