// Iron Ridge site settings.
// Leave SUPABASE_URL and SUPABASE_ANON_KEY empty to run in DEMO MODE
// (the quote form does not save anything and the admin page shows sample data).
//
// The anon key is meant to be public. It is safe ONLY because Row Level Security
// is turned on (see supabase/schema.sql). NEVER put the service_role key here.

export const CONFIG = {
  SUPABASE_URL: "",       // e.g. "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",  // Project Settings > API > anon public key
  PHOTO_BUCKET: "quote-photos",
  MAX_PHOTOS: 6,
  MAX_PHOTO_MB: 8,
};

export const isDemo = () => !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY;
