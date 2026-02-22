
-- Analytics table for AI helper monkey interactions
CREATE TABLE public.monkey_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  event TEXT NOT NULL,
  context TEXT,         -- page context: "home", "ai-chess", "create-room", etc.
  metadata TEXT,        -- action detail: which welcome button, mode selected, etc.
  lang TEXT,            -- user language
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for querying by event type and date
CREATE INDEX idx_monkey_analytics_event ON public.monkey_analytics (event, created_at DESC);
CREATE INDEX idx_monkey_analytics_session ON public.monkey_analytics (session_id);

-- Enable RLS
ALTER TABLE public.monkey_analytics ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for regular users — only service role (edge functions) can read
-- Insert via edge function using service role key
