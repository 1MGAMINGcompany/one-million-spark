INSERT INTO public.operators (
  user_id,
  brand_name,
  subdomain,
  theme,
  fee_percent,
  status,
  brand_color,
  welcome_message,
  support_email,
  disabled_sports
)
VALUES (
  'system-demo',
  '1MG Live Demo',
  'demo',
  'dark',
  15,
  'active',
  '#2563eb',
  'Explore the official 1MG.live demo app.',
  'support@1mg.live',
  ARRAY[]::text[]
)
ON CONFLICT (subdomain) DO UPDATE SET
  brand_name = EXCLUDED.brand_name,
  theme = EXCLUDED.theme,
  fee_percent = EXCLUDED.fee_percent,
  status = EXCLUDED.status,
  brand_color = EXCLUDED.brand_color,
  welcome_message = EXCLUDED.welcome_message,
  support_email = EXCLUDED.support_email,
  disabled_sports = EXCLUDED.disabled_sports,
  updated_at = now();