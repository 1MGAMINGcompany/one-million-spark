-- Lock down who can execute start_session
REVOKE ALL ON FUNCTION public.start_session(text, text, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.start_session(text, text, text, text, text, boolean) TO anon, authenticated;