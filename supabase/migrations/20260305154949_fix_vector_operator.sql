CREATE OR REPLACE FUNCTION public.search_sophia_knowledge(
  query_embedding extensions.vector,
  match_count integer DEFAULT 5,
  filter_category text DEFAULT NULL::text,
  filter_language text DEFAULT NULL::text
) RETURNS TABLE(
  id uuid,
  category text,
  title text,
  content text,
  tags text[],
  similarity double precision
)
LANGUAGE plpgsql
SET search_path TO public, extensions
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.category,
    k.title,
    k.content,
    k.tags,
    1 - (k.embedding <=> query_embedding) AS similarity
  FROM public.sophia_knowledge_base k
  WHERE
    (filter_category IS NULL OR k.category = filter_category)
    AND (filter_language IS NULL OR k.language = filter_language)
    AND k.embedding IS NOT NULL
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;


CREATE OR REPLACE FUNCTION public.search_sophia_memory(
  p_user_id uuid,
  query_embedding extensions.vector,
  match_count integer DEFAULT 5,
  min_importance double precision DEFAULT 0.0
) RETURNS TABLE(
  id uuid,
  role text,
  content text,
  importance double precision,
  topics text[],
  entities jsonb,
  similarity double precision,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.role,
    m.content,
    m.importance,
    m.topics,
    m.entities,
    1 - (m.embedding <=> query_embedding) AS similarity,
    m.created_at
  FROM public.sophia_conversation_memory m
  WHERE m.user_id = p_user_id
    AND m.importance >= min_importance
    AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;
