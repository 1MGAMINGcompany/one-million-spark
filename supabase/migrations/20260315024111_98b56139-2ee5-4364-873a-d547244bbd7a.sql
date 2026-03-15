CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_events_source_event_id_unique 
ON public.prediction_events (source_event_id) 
WHERE source_event_id IS NOT NULL;