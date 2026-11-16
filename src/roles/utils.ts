import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from '../config';

export const inviteUser = async (email: string, redirectTo: string) => {
  const supabaseAdmin = createClient(
    supabaseEnv.url,
    supabaseEnv.secretKeys.default,
  );

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });

  if (error) {
    throw error;
  }
  return user;
};
