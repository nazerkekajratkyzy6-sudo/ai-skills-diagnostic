-- =====================================================================
-- AI Skills Diagnostic — дерекқор схемасы / схема базы данных
-- Supabase → SQL Editor → New query → осы файлды толық қойып → Run
-- Файл қайта іске қосуға қауіпсіз (повторный запуск безопасен).
-- =====================================================================

set client_min_messages = warning;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Көмекші функциялар / вспомогательные функции
-- ---------------------------------------------------------------------

-- Кездейсоқ код (шатастыратын 0/O, 1/I/L әріптерінсіз)
create or replace function public.gen_code(len int default 6)
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  bytes bytea := extensions.gen_random_bytes(len);
  i int;
begin
  for i in 0 .. len - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end $$;

-- ---------------------------------------------------------------------
-- 2. Кестелер / таблицы
-- ---------------------------------------------------------------------

create table if not exists public.schools (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) between 2 and 300),
  region          text,
  city            text,
  code            text not null unique default public.gen_code(6),
  status          text not null default 'active' check (status in ('active', 'inactive')),
  diagnostic_open boolean not null default true,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('super_admin', 'school_admin')),
  school_id   uuid references public.schools (id) on delete set null,
  full_name   text,
  login       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint school_admin_has_school check (role <> 'school_admin' or school_id is not null)
);

create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default public.gen_code(6),
  name_kk       text not null,
  name_ru       text not null,
  topic_kk      text not null,
  topic_ru      text not null,
  status        text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  all_schools   boolean not null default true,
  is_demo       boolean not null default false,
  -- Топқа бөлу шектері (SUPER ADMIN баптайды) / пороги групп
  g2_min_percent            int not null default 40 check (g2_min_percent between 0 and 100),
  g2_min_completed          int not null default 2  check (g2_min_completed >= 0),
  g3_min_percent            int not null default 75 check (g3_min_percent between 0 and 100),
  g3_min_level2             int not null default 3  check (g3_min_level2 >= 0),
  g3_min_vibe               int not null default 2  check (g3_min_vibe between 0 and 2),
  -- Бағалау критерийлері / критерии оценивания
  require_prompt_for_level2 boolean not null default false,
  min_prompt_length         int not null default 20 check (min_prompt_length >= 0),
  min_text_length           int not null default 40 check (min_text_length >= 0),
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

create table if not exists public.campaign_schools (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  school_id   uuid not null references public.schools (id) on delete cascade,
  primary key (campaign_id, school_id)
);

create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns (id) on delete cascade,
  key             text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  kind            text not null default 'standard' check (kind in ('standard', 'vibe')),
  position        int not null default 0,
  enabled         boolean not null default true,
  title_kk        text not null,
  title_ru        text not null,
  instruction_kk  text not null default '',
  instruction_ru  text not null default '',
  tool_options    text[] not null default '{}',
  allow_text      boolean not null default false,          -- нәтижені мәтінмен беруге рұқсат
  prompt_mode     text not null default 'optional' check (prompt_mode in ('none', 'optional', 'required')),
  process_kk      text[] not null default '{}',            -- 0/1/2 деңгейлерінің сипаттамасы
  process_ru      text[] not null default '{}',
  extra_type      text not null default 'none' check (extra_type in ('none', 'multi', 'single')),
  extra_question_kk text,
  extra_question_ru text,
  extra_options_kk  text[] not null default '{}',
  extra_options_ru  text[] not null default '{}',
  unique (campaign_id, key)
);

create table if not exists public.participants (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  full_name     text not null check (length(trim(full_name)) between 3 and 200),
  name_key      text generated always as (lower(regexp_replace(trim(full_name), '\s+', ' ', 'g'))) stored,
  position      text,
  personal_code text not null unique default public.gen_code(8),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.submissions (
  id               uuid primary key default gen_random_uuid(),
  participant_id   uuid not null references public.participants (id) on delete cascade,
  school_id        uuid not null references public.schools (id) on delete cascade,
  campaign_id      uuid not null references public.campaigns (id) on delete cascade,
  full_name        text not null,
  position         text,
  language         text not null default 'kk' check (language in ('kk', 'ru')),
  started_at       timestamptz,
  finished_at      timestamptz not null default now(),
  duration_seconds int,
  total_score      int not null default 0,
  max_score        int not null default 0,
  percent          numeric(5, 1) not null default 0,
  group_no         int not null default 1 check (group_no in (1, 2, 3)),
  tools_used       text[] not null default '{}',
  tools_count      int not null default 0,
  vibe_self        int,
  result_token     uuid not null unique default gen_random_uuid(),
  reviewed         boolean not null default false,
  is_demo          boolean not null default false,
  unique (participant_id, campaign_id)
);

create table if not exists public.answers (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.submissions (id) on delete cascade,
  task_id        uuid references public.tasks (id) on delete set null,
  task_key       text not null,
  school_id      uuid not null references public.schools (id) on delete cascade,
  campaign_id    uuid not null references public.campaigns (id) on delete cascade,
  process_level  int not null default 0 check (process_level between 0 and 2),
  auto_score     int not null default 0 check (auto_score between 0 and 2),
  score          int not null default 0 check (score between 0 and 2),
  tools          text[] not null default '{}',
  other_tool     text,
  link           text,
  result_text    text,
  prompt_text    text,
  extra_answer   int[] not null default '{}',
  time_seconds   int,
  unique (submission_id, task_key)
);

-- ---------------------------------------------------------------------
-- 2a. v1.1 толықтырулары: платформалар сауалнамасы, файл-дәлелдер, «бір өнім + Vibe Coding» режимі
-- ---------------------------------------------------------------------
-- Бұрыннан бар диагностикалар ескі режимде қалады (false), жаңалары — «бір өнім + Vibe Coding» (true)
alter table public.campaigns add column if not exists product_choice  boolean not null default false;
alter table public.campaigns alter column product_choice set default true;
alter table public.campaigns add column if not exists platform_survey boolean not null default true;
alter table public.campaigns add column if not exists allow_files     boolean not null default true;
alter table public.campaigns add column if not exists max_files       int not null default 3;
-- Сауалнамадағы платформалар тізімі (әр диагностикада SUPER ADMIN өзгерте алады)
create or replace function public._default_platforms()
returns text[] language sql immutable set search_path = public as $$
  select array[
  'ChatGPT','Gemini','Claude','Microsoft Copilot','DeepSeek','Perplexity','NotebookLM',
  'Canva','Adobe Express','Gamma','PowerPoint (Copilot)','Napkin AI',
  'MagicSchool','Twee','Wayground (Quizizz)','Kahoot!','Wordwall','LearningApps','Padlet','Genially','Google Forms','Bilimland',
  'Suno','HeyGen','CapCut',
  'Cursor','Lovable','Replit','Bolt','v0'];
$$;
alter table public.campaigns add column if not exists platform_options text[] not null default public._default_platforms();
alter table public.campaigns alter column g2_min_percent   set default 50;
alter table public.campaigns alter column g2_min_completed set default 1;
alter table public.campaigns alter column g3_min_level2    set default 1;
alter table public.campaigns alter column g3_min_vibe      set default 1;

alter table public.submissions add column if not exists chosen_task     text;
alter table public.submissions add column if not exists platforms       jsonb not null default '{}'::jsonb;  -- {"Canva":2,"Gamma":1}
alter table public.submissions add column if not exists platforms_other text;
alter table public.answers     add column if not exists files           jsonb not null default '[]'::jsonb; -- [{path,name,size,type}]

create index if not exists idx_profiles_school      on public.profiles (school_id);
create index if not exists idx_participants_school  on public.participants (school_id, name_key);
create index if not exists idx_submissions_campaign on public.submissions (campaign_id);
create index if not exists idx_submissions_school   on public.submissions (school_id);
create index if not exists idx_submissions_finished on public.submissions (finished_at);
create index if not exists idx_submissions_part     on public.submissions (participant_id);
create index if not exists idx_answers_submission   on public.answers (submission_id);
create index if not exists idx_answers_campaign_key on public.answers (campaign_id, task_key);
create index if not exists idx_answers_school       on public.answers (school_id);
create index if not exists idx_tasks_campaign       on public.tasks (campaign_id, position);

-- ---------------------------------------------------------------------
-- 3. Рөлдер / роли
-- ---------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles
                 where id = auth.uid() and role = 'super_admin' and is_active);
$$;

create or replace function public.my_school_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.school_id from profiles p join schools s on s.id = p.school_id
  where p.id = auth.uid() and p.role = 'school_admin' and p.is_active and s.status = 'active';
$$;

-- ---------------------------------------------------------------------
-- 4. Row Level Security — мектеп деректерін оқшаулау / изоляция данных
-- ---------------------------------------------------------------------

alter table public.schools          enable row level security;
alter table public.profiles         enable row level security;
alter table public.campaigns        enable row level security;
alter table public.campaign_schools enable row level security;
alter table public.tasks            enable row level security;
alter table public.participants     enable row level security;
alter table public.submissions      enable row level security;
alter table public.answers          enable row level security;

-- Әкімшілерге кесте құқықтары (қатарларды RLS шектейді) / права на таблицы (строки ограничивает RLS)
grant select, insert, update, delete on public.schools, public.profiles, public.campaigns, public.campaign_schools,
      public.tasks, public.participants, public.submissions, public.answers to authenticated;
grant all on public.schools, public.profiles, public.campaigns, public.campaign_schools,
      public.tasks, public.participants, public.submissions, public.answers to service_role;

-- Қатысушы (anon) кестелерді тікелей оқи алмайды — тек төмендегі RPC арқылы.
revoke all on public.schools, public.profiles, public.campaigns, public.campaign_schools,
              public.tasks, public.participants, public.submissions, public.answers from anon;

do $$
declare t text;
begin
  foreach t in array array['schools','profiles','campaigns','campaign_schools','tasks',
                           'participants','submissions','answers'] loop
    execute format('drop policy if exists super_all on public.%I', t);
    execute format('create policy super_all on public.%I for all to authenticated
                    using ((select public.is_super_admin())) with check ((select public.is_super_admin()))', t);
  end loop;
end $$;

drop policy if exists school_read on public.schools;
create policy school_read on public.schools for select to authenticated
  using (id = (select public.my_school_id()));

drop policy if exists self_read on public.profiles;
create policy self_read on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists school_read on public.campaigns;
create policy school_read on public.campaigns for select to authenticated
  using ((select public.my_school_id()) is not null and status <> 'draft' and not is_demo and
         (all_schools or exists (select 1 from public.campaign_schools cs
                                 where cs.campaign_id = campaigns.id
                                   and cs.school_id = (select public.my_school_id()))));

drop policy if exists school_read on public.campaign_schools;
create policy school_read on public.campaign_schools for select to authenticated
  using (school_id = (select public.my_school_id()));

drop policy if exists school_read on public.tasks;
create policy school_read on public.tasks for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = tasks.campaign_id));  -- campaigns RLS қолданылады

drop policy if exists school_rw on public.participants;
drop policy if exists school_read on public.participants;
drop policy if exists school_insert on public.participants;
drop policy if exists school_update on public.participants;
-- Мектеп әкімшісі қатысушыны қосып/өзгерте алады, бірақ жоя алмайды (нәтижелер сақталады)
create policy school_read on public.participants for select to authenticated
  using (school_id = (select public.my_school_id()));
create policy school_insert on public.participants for insert to authenticated
  with check (school_id = (select public.my_school_id()) and not is_demo);
create policy school_update on public.participants for update to authenticated
  using (school_id = (select public.my_school_id()))
  with check (school_id = (select public.my_school_id()) and not is_demo);

drop policy if exists school_read on public.submissions;
create policy school_read on public.submissions for select to authenticated
  using (school_id = (select public.my_school_id()));

drop policy if exists school_read on public.answers;
create policy school_read on public.answers for select to authenticated
  using (school_id = (select public.my_school_id()));

-- ---------------------------------------------------------------------
-- 5. Бағалау және топқа бөлу / оценивание и распределение
-- ---------------------------------------------------------------------

create or replace function public._is_url(v text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(v ~* '^https?://[^\s/$.?#]+\.[^\s]+$', false);
$$;

-- Бір тапсырманың автоматты балы 0/1/2
drop function if exists public._auto_score(public.tasks, public.campaigns, int, text, text, text);
create or replace function public._auto_score(
  t public.tasks, c public.campaigns, p_process int, p_link text, p_text text, p_prompt text, p_files int default 0)
returns int language plpgsql immutable set search_path = public as $$
declare
  has_evidence boolean;
  prompt_ok boolean := length(coalesce(trim(p_prompt), '')) >= c.min_prompt_length;
begin
  has_evidence := public._is_url(trim(p_link))
               or coalesce(p_files, 0) > 0
               or (t.allow_text and length(coalesce(trim(p_text), '')) >= c.min_text_length);
  -- Практикалық дәлел (сілтеме/файл/мәтін) болмаса — 0
  if not has_evidence or coalesce(p_process, 0) <= 0 then return 0; end if;
  if t.prompt_mode = 'required' and not prompt_ok then return 1; end if;
  if p_process >= 2 then
    if c.require_prompt_for_level2 and not prompt_ok then return 1; end if;
    return 2;
  end if;
  return 1;
end $$;

-- Жиынтық ұпай мен топты қайта есептеу
create or replace function public._recalc_submission(p_submission uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s submissions; c campaigns;
  v_total int; v_max int; v_completed int; v_level2 int; v_vibe int; v_has_vibe boolean;
  v_pct numeric; v_group int;
begin
  select * into s from submissions where id = p_submission;
  if not found then return; end if;
  select * into c from campaigns where id = s.campaign_id;

  select coalesce(sum(a.score), 0), count(*) * 2,
         count(*) filter (where a.score >= 1), count(*) filter (where a.score = 2),
         max(a.score) filter (where t.kind = 'vibe'), bool_or(t.kind = 'vibe')
    into v_total, v_max, v_completed, v_level2, v_vibe, v_has_vibe
  from answers a left join tasks t on t.id = a.task_id
  where a.submission_id = p_submission;

  v_pct := case when v_max > 0 then round(v_total * 100.0 / v_max, 1) else 0 end;

  if v_pct >= c.g3_min_percent and v_level2 >= c.g3_min_level2
     and (not coalesce(v_has_vibe, false) or coalesce(v_vibe, 0) >= c.g3_min_vibe) then
    v_group := 3;
  elsif v_pct >= c.g2_min_percent and v_completed >= c.g2_min_completed then
    v_group := 2;
  else
    v_group := 1;
  end if;

  update submissions set total_score = v_total, max_score = v_max, percent = v_pct, group_no = v_group
  where id = p_submission;
end $$;

create or replace function public._answers_score_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._recalc_submission(new.submission_id);
  return new;
end $$;

drop trigger if exists trg_answers_score on public.answers;
create trigger trg_answers_score after update of score on public.answers
  for each row when (old.score is distinct from new.score)
  execute function public._answers_score_changed();

-- ---------------------------------------------------------------------
-- 6. Әдепкі тапсырмалар / задания по умолчанию
-- ---------------------------------------------------------------------

create or replace function public._insert_default_tasks(p_campaign uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  proc_kk text[] := array[
    'Орындай алмадым / нәтиже жоқ',
    'Дайын шаблонның, толық нұсқаулықтың немесе басқа адамның көмегімен орындадым',
    'Құралды өзім таңдадым, сұрауды өзім құрастырдым, нәтиже алып, оны өзім түзеттім немесе толықтырдым'];
  proc_ru text[] := array[
    'Не смог(ла) выполнить / результата нет',
    'Выполнил(а) с помощью готового шаблона, подробной подсказки или помощи другого человека',
    'Сам(а) выбрал(а) инструмент, сформулировал(а) запрос, получил(а) результат и доработал(а) его'];
  general_tools text[] := array['ChatGPT','Gemini','Claude','Canva','Adobe','Microsoft Copilot','Gamma'];
begin
  insert into tasks (campaign_id, key, kind, position, title_kk, title_ru, instruction_kk, instruction_ru,
                     tool_options, allow_text, prompt_mode, process_kk, process_ru,
                     extra_type, extra_question_kk, extra_question_ru, extra_options_kk, extra_options_ru)
  values
  (p_campaign, 'infographic', 'standard', 1, 'Инфографика', 'Инфографика',
   'Кез келген ЖИ құралының көмегімен ұсынылған тақырып бойынша шағын инфографика жасаңыз. 3–5 негізгі тұжырым жеткілікті. Құралды өзіңіз таңдайсыз. Дайын нәтижеге сілтемені төменге қойыңыз.',
   'Создайте с помощью любого ИИ небольшую инфографику по предложенной теме. Достаточно 3–5 ключевых тезисов. Инструмент вы выбираете сами. Вставьте ссылку на готовый результат ниже.',
   general_tools, false, 'optional', proc_kk, proc_ru, 'none', null, null, '{}', '{}'),

  (p_campaign, 'worksheet', 'standard', 2, 'Жұмыс парағы', 'Рабочий лист',
   'ЖИ көмегімен ұсынылған тақырып бойынша шағын жұмыс парағын жасаңыз. 2–4 тапсырма жеткілікті, үлкен құжат қажет емес. Нәтижеге сілтемені төменге қойыңыз.',
   'Создайте с помощью ИИ небольшой рабочий лист по предложенной теме. Достаточно 2–4 заданий, большой документ не нужен. Вставьте ссылку на результат ниже.',
   general_tools, false, 'optional', proc_kk, proc_ru, 'none', null, null, '{}', '{}'),

  (p_campaign, 'presentation', 'standard', 3, 'Презентация', 'Презентация',
   'ЖИ көмегімен ұсынылған тақырып бойынша 3–5 слайдтан тұратын шағын презентация жасаңыз. Ұзын презентация қажет емес. Нәтижеге сілтемені төменге қойыңыз.',
   'Создайте с помощью ИИ мини-презентацию на 3–5 слайдов по предложенной теме. Длинная презентация не нужна. Вставьте ссылку на результат ниже.',
   array['Gamma','Canva','PowerPoint AI','ChatGPT','Gemini','Claude','Microsoft Copilot'],
   false, 'optional', proc_kk, proc_ru, 'multi',
   'Презентация жасау үшін қандай құралдарды шынымен қолдана аласыз?',
   'Какие инструменты для создания презентаций вы реально умеете использовать?',
   array['Gamma','Canva','PowerPoint AI','ChatGPT','Gemini','Copilot','Басқалары'],
   array['Gamma','Canva','PowerPoint AI','ChatGPT','Gemini','Copilot','Другие']),

  (p_campaign, 'kmzh', 'standard', 4, 'ҚМЖ (қысқа мерзімді жоспар)', 'ҚМЖ (краткосрочный план)',
   'ЖИ көмегімен ұсынылған тақырып бойынша ҚМЖ-ның шағын фрагментін жасаңыз (мысалы, сабақ мақсаттары және бір тапсырма). Толық ҚМЖ қажет емес. Ең бастысы — ЖИ-ге тапсырманы дұрыс қоя білу, сондықтан ЖИ-ге жазған сұрауыңызды (промптты) міндетті түрде көрсетіңіз.',
   'С помощью ИИ создайте небольшой фрагмент ҚМЖ по предложенной теме (например, цели урока и одно задание). Полный ҚМЖ не нужен. Главное — умение правильно поставить задачу ИИ, поэтому обязательно укажите запрос (промпт), который вы написали ИИ.',
   array['ChatGPT','Gemini','Claude','Microsoft Copilot','MagicSchool'],
   true, 'required', proc_kk, proc_ru, 'multi',
   'ҚМЖ жасау үшін қандай ЖИ құралдарын шынымен қолдана аласыз?',
   'Какие ИИ-инструменты вы реально умеете использовать для создания ҚМЖ?',
   array['ChatGPT','Gemini','Claude','Microsoft Copilot','MagicSchool','Басқалары'],
   array['ChatGPT','Gemini','Claude','Microsoft Copilot','MagicSchool','Другие']),

  (p_campaign, 'vibe_coding', 'vibe', 5, 'Vibe Coding', 'Vibe Coding',
   'ЖИ көмегімен қарапайым интерактивті веб-бет жасаңыз: мысалы, батырма, енгізу өрісі және жауапты қарапайым тексеру. Күрделі сайт қажет емес. Бетті жариялап (Claude, ChatGPT Canvas, CodePen, GitHub Pages, Netlify т.б.), сілтемесін қойыңыз.',
   'С помощью ИИ создайте простую интерактивную веб-страницу: например, кнопка, поле ввода и простая проверка ответа. Сложный сайт не нужен. Опубликуйте страницу (Claude, ChatGPT Canvas, CodePen, GitHub Pages, Netlify и т. п.) и вставьте ссылку.',
   array['ChatGPT','Claude','Gemini','Microsoft Copilot','Cursor','Replit','Lovable','Bolt','v0'],
   false, 'optional',
   array['Орындай алмадым / бұрын байқап көрмегенмін',
         'ЖИ көмегімен қарапайым веб-бет алдым',
         'Бетті ЖИ арқылы өзім өзгерттім, қатесін түзеттім немесе жаңа функция қостым'],
   array['Не смог(ла) выполнить / раньше не пробовал(а)',
         'Получил(а) простую веб-страницу с помощью ИИ',
         'Сам(а) изменял(а) страницу через ИИ, исправлял(а) ошибки или добавлял(а) функции'],
   'single', 'Vibe Coding бойынша тәжірибеңіз қандай?', 'Какой у вас опыт Vibe Coding?',
   array['Ешқашан байқап көрмегенмін',
         'ЖИ-ден қарапайым HTML жасауды сұрай аламын',
         'ЖИ арқылы кодты өзгерте аламын',
         'Қарапайым интерактивті веб-құралдар жасай аламын',
         'ЖИ арқылы қателерді өзім тауып, түзетіп, жаңа функциялар қоса аламын'],
   array['Никогда не пробовал(а)',
         'Могу попросить ИИ создать простой HTML',
         'Могу изменять код через ИИ',
         'Могу создавать простые интерактивные веб-инструменты',
         'Могу самостоятельно находить ошибки, исправлять код и добавлять функции через ИИ']);
end $$;

-- ---------------------------------------------------------------------
-- 7. Қатысушыға арналған RPC (anon) / RPC для участника
-- ---------------------------------------------------------------------

create or replace function public._find_campaign(p_school uuid, p_campaign_code text)
returns public.campaigns language sql stable security definer set search_path = public as $$
  select c.* from campaigns c
  where c.status = 'published'
    and (p_campaign_code is null or p_campaign_code = '' or c.code = upper(trim(p_campaign_code)))
    and (c.all_schools or exists (select 1 from campaign_schools cs
                                  where cs.campaign_id = c.id and cs.school_id = p_school))
    and c.is_demo = (select is_demo from schools where id = p_school)
  order by c.published_at desc nulls last, c.created_at desc
  limit 1;
$$;

create or replace function public.get_diagnostic(
  p_school_code text, p_campaign_code text default null, p_personal_code text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  sc schools; c campaigns; pa participants;
begin
  if coalesce(p_personal_code, '') <> '' then
    select * into pa from participants where personal_code = upper(trim(p_personal_code));
    if not found then raise exception 'personal_code_not_found' using errcode = 'P0001'; end if;
    select * into sc from schools where id = pa.school_id;
  else
    select * into sc from schools where code = upper(trim(coalesce(p_school_code, '')));
    if not found then raise exception 'school_not_found' using errcode = 'P0001'; end if;
  end if;
  if sc.status <> 'active' then raise exception 'school_inactive' using errcode = 'P0001'; end if;
  if not sc.diagnostic_open then raise exception 'diagnostic_closed' using errcode = 'P0001'; end if;

  c := public._find_campaign(sc.id, p_campaign_code);
  if c.id is null then raise exception 'no_campaign' using errcode = 'P0001'; end if;

  return jsonb_build_object(
    'school', jsonb_build_object('name', sc.name, 'code', sc.code, 'city', sc.city, 'is_demo', sc.is_demo),
    'campaign', jsonb_build_object('code', c.code, 'name_kk', c.name_kk, 'name_ru', c.name_ru,
                                   'topic_kk', c.topic_kk, 'topic_ru', c.topic_ru,
                                   'product_choice', c.product_choice, 'platform_survey', c.platform_survey,
                                   'platform_options', to_jsonb(c.platform_options),
                                   'allow_files', c.allow_files, 'max_files', c.max_files),
    'participant', case when pa.id is null then null
                   else jsonb_build_object('full_name', pa.full_name, 'position', pa.position,
                                           'personal_code', pa.personal_code) end,
    'tasks', coalesce((select jsonb_agg(jsonb_build_object(
        'key', t.key, 'kind', t.kind, 'title_kk', t.title_kk, 'title_ru', t.title_ru,
        'instruction_kk', t.instruction_kk, 'instruction_ru', t.instruction_ru,
        'tool_options', to_jsonb(t.tool_options), 'allow_text', t.allow_text, 'prompt_mode', t.prompt_mode,
        'process_kk', to_jsonb(t.process_kk), 'process_ru', to_jsonb(t.process_ru),
        'extra_type', t.extra_type, 'extra_question_kk', t.extra_question_kk,
        'extra_question_ru', t.extra_question_ru,
        'extra_options_kk', to_jsonb(t.extra_options_kk), 'extra_options_ru', to_jsonb(t.extra_options_ru))
        order by t.position, t.key)
      from tasks t where t.campaign_id = c.id and t.enabled), '[]'::jsonb)
  );
end $$;

-- Файл Supabase Storage-та («evidence» бакеті) шынымен бар ма?
create or replace function public._evidence_exists(p_path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean;
begin
  if to_regclass('storage.objects') is null then return false; end if;
  execute 'select exists (select 1 from storage.objects where bucket_id = ''evidence'' and name = $1)' into ok using p_path;
  return ok;
end $$;

-- Ішкі функция: нәтижені сақтау (submit_diagnostic және демо деректер қолданады)
create or replace function public._create_submission(p jsonb, p_school uuid, p_campaign uuid,
                                                     p_participant uuid, p_is_demo boolean)
returns public.submissions language plpgsql security definer set search_path = public as $$
declare
  c campaigns; t tasks; a jsonb; s submissions;
  v_started timestamptz; v_finished timestamptz; v_tools text[] := '{}'; v_process int;
  v_link text; v_text text; v_prompt text; v_other text; v_score int; v_vibe_self int;
  v_task_tools text[]; v_extra int[]; v_chosen text; v_files jsonb; v_platforms jsonb := '{}'::jsonb;
  f jsonb; k text; v text;
begin
  select * into c from campaigns where id = p_campaign;

  -- «Бір өнім + Vibe Coding» режимі: педагог таңдаған бір практикалық тапсырма
  if c.product_choice and exists (select 1 from tasks where campaign_id = p_campaign and enabled and kind = 'standard') then
    v_chosen := p->>'chosen_task';
    if v_chosen is null or not exists (select 1 from tasks where campaign_id = p_campaign and enabled
                                         and kind = 'standard' and key = v_chosen) then
      raise exception 'invalid_choice' using errcode = 'P0001';
    end if;
  end if;

  -- Платформалар сауалнамасы: {"Canva": 2, "Gamma": 1}  (1 = таныспын, 2 = еркін меңгергенмін)
  if c.platform_survey and jsonb_typeof(p->'platforms') = 'object' then
    for k, v in select * from jsonb_each_text(p->'platforms') loop
      if k = any (c.platform_options) and v in ('1', '2') then
        v_platforms := v_platforms || jsonb_build_object(k, v::int);
      end if;
    end loop;
  end if;
  v_finished := coalesce((p->>'finished_at')::timestamptz, now());
  begin
    v_started := (p->>'started_at')::timestamptz;
  exception when others then v_started := null; end;
  if v_started is null or v_started > v_finished or v_started < v_finished - interval '12 hours' then
    v_started := null;
  end if;

  insert into submissions (participant_id, school_id, campaign_id, full_name, position, language,
                           started_at, finished_at, duration_seconds, is_demo,
                           chosen_task, platforms, platforms_other)
  values (p_participant, p_school, p_campaign,
          (select full_name from participants where id = p_participant),
          left(nullif(trim(coalesce(p->>'position', '')), ''), 200),
          case when p->>'language' = 'ru' then 'ru' else 'kk' end,
          v_started, v_finished,
          case when v_started is null then null else extract(epoch from v_finished - v_started)::int end,
          p_is_demo, v_chosen, v_platforms,
          case when c.platform_survey then left(nullif(trim(coalesce(p->>'platforms_other', '')), ''), 300) end)
  returning * into s;

  for t in select * from tasks where campaign_id = p_campaign and enabled
             and (v_chosen is null or kind <> 'standard' or key = v_chosen)
           order by position loop
    select x.value into a from jsonb_array_elements(coalesce(p->'answers', '[]'::jsonb)) x
      where x.value->>'task_key' = t.key limit 1;
    a := coalesce(a, '{}'::jsonb);

    v_process := least(greatest(coalesce((a->>'process_level')::int, 0), 0), 2);
    v_link    := left(nullif(trim(coalesce(a->>'link', '')), ''), 2000);
    v_text    := case when t.allow_text then left(nullif(trim(coalesce(a->>'result_text', '')), ''), 20000) end;
    v_prompt  := case when t.prompt_mode <> 'none' then left(nullif(trim(coalesce(a->>'prompt_text', '')), ''), 10000) end;
    v_other   := left(nullif(trim(coalesce(a->>'other_tool', '')), ''), 200);
    select coalesce(array_agg(distinct left(trim(x), 100)), '{}') into v_task_tools
      from jsonb_array_elements_text(coalesce(a->'tools', '[]'::jsonb)) x
      where trim(x) <> '' and (trim(x) = any (t.tool_options));
    select coalesce(array_agg(distinct x::int), '{}') into v_extra
      from jsonb_array_elements_text(coalesce(a->'extra_answer', '[]'::jsonb)) x
      where x ~ '^\d+$' and x::int < greatest(cardinality(t.extra_options_kk), cardinality(t.extra_options_ru));

    -- Жүктелген файлдар: тек осы мектептің қалтасынан, саны шектеулі, сақтау орнында бар болуы керек
    v_files := '[]'::jsonb;
    if c.allow_files and jsonb_typeof(a->'files') = 'array' then
      for f in select x from jsonb_array_elements(a->'files') x limit greatest(c.max_files, 0) loop
        if coalesce(f->>'path', '') like p_school::text || '/%' and f->>'path' !~ '\.\.'
           and public._evidence_exists(f->>'path') then
          v_files := v_files || jsonb_build_array(jsonb_build_object(
            'path', f->>'path', 'name', left(coalesce(f->>'name', 'file'), 200),
            'size', coalesce((f->>'size')::bigint, 0), 'type', left(coalesce(f->>'type', ''), 120)));
        end if;
      end loop;
    end if;

    v_score := public._auto_score(t, c, v_process, v_link, v_text, v_prompt, jsonb_array_length(v_files));

    insert into answers (submission_id, task_id, task_key, school_id, campaign_id, process_level,
                         auto_score, score, tools, other_tool, link, result_text, prompt_text,
                         extra_answer, time_seconds, files)
    values (s.id, t.id, t.key, p_school, p_campaign, v_process, v_score, v_score, v_task_tools, v_other,
            v_link, v_text, v_prompt, v_extra,
            least(greatest(coalesce((a->>'time_seconds')::int, 0), 0), 43200), v_files);

    v_tools := v_tools || v_task_tools || case when v_other is null then '{}'::text[] else array[v_other] end;
    if t.kind = 'vibe' and t.extra_type = 'single' and cardinality(v_extra) > 0 then
      v_vibe_self := v_extra[1] + 1;   -- 1..5
    end if;
  end loop;

  select coalesce(array_agg(distinct x order by x), '{}') into v_tools from unnest(v_tools) x;
  update submissions set tools_used = v_tools, tools_count = cardinality(v_tools), vibe_self = v_vibe_self
  where id = s.id;
  perform public._recalc_submission(s.id);
  select * into s from submissions where id = s.id;
  return s;
end $$;

create or replace function public.submit_diagnostic(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  sc schools; c campaigns; pa participants; s submissions;
  v_name text := regexp_replace(trim(coalesce(p->>'full_name', '')), '\s+', ' ', 'g');
begin
  if coalesce(p->>'personal_code', '') <> '' then
    select * into pa from participants where personal_code = upper(trim(p->>'personal_code'));
    if not found then raise exception 'personal_code_not_found' using errcode = 'P0001'; end if;
    select * into sc from schools where id = pa.school_id;
  else
    select * into sc from schools where code = upper(trim(coalesce(p->>'school_code', '')));
    if not found then raise exception 'school_not_found' using errcode = 'P0001'; end if;
  end if;
  if sc.status <> 'active' then raise exception 'school_inactive' using errcode = 'P0001'; end if;
  if not sc.diagnostic_open then raise exception 'diagnostic_closed' using errcode = 'P0001'; end if;

  c := public._find_campaign(sc.id, p->>'campaign_code');
  if c.id is null then raise exception 'no_campaign' using errcode = 'P0001'; end if;

  if pa.id is null then
    if length(v_name) < 3 or length(v_name) > 200 then
      raise exception 'invalid_name' using errcode = 'P0001';
    end if;
    select * into pa from participants
      where school_id = sc.id and name_key = lower(v_name) order by created_at limit 1;
    if not found then
      insert into participants (school_id, full_name, position, is_demo)
      values (sc.id, v_name, left(nullif(trim(coalesce(p->>'position', '')), ''), 200), sc.is_demo)
      returning * into pa;
    end if;
  end if;

  if exists (select 1 from submissions where participant_id = pa.id and campaign_id = c.id) then
    raise exception 'already_submitted' using errcode = 'P0001';
  end if;

  if coalesce(p->>'position', '') <> '' and pa.position is null then
    update participants set position = left(trim(p->>'position'), 200) where id = pa.id;
  end if;

  s := public._create_submission(p, sc.id, c.id, pa.id, sc.is_demo);
  return jsonb_build_object('token', s.result_token, 'group_no', s.group_no);
end $$;

create or replace function public.get_result(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'full_name', s.full_name, 'school', sc.name, 'finished_at', s.finished_at,
    'language', s.language, 'group_no', s.group_no,
    'campaign_kk', c.name_kk, 'campaign_ru', c.name_ru,
    'completed_tasks', (select coalesce(jsonb_agg(jsonb_build_object('title_kk', t.title_kk, 'title_ru', t.title_ru,
                                                      'done', a.score > 0) order by t.position), '[]'::jsonb)
                        from answers a join tasks t on t.id = a.task_id where a.submission_id = s.id))
  from submissions s join schools sc on sc.id = s.school_id join campaigns c on c.id = s.campaign_id
  where s.result_token = p_token;
$$;

-- ---------------------------------------------------------------------
-- 8. Әкімшілік RPC / административные RPC
-- ---------------------------------------------------------------------

create or replace function public._require_super()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create or replace function public.create_campaign(p jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_src uuid := nullif(p->>'copy_from', '')::uuid; src campaigns;
begin
  perform public._require_super();
  if v_src is not null then select * into src from campaigns where id = v_src; end if;

  insert into campaigns (name_kk, name_ru, topic_kk, topic_ru, all_schools,
                         g2_min_percent, g2_min_completed, g3_min_percent, g3_min_level2, g3_min_vibe,
                         require_prompt_for_level2, min_prompt_length, min_text_length,
                         product_choice, platform_survey, allow_files, max_files, platform_options)
  values (trim(p->>'name_kk'), trim(p->>'name_ru'),
          coalesce(nullif(trim(p->>'topic_kk'), ''), src.topic_kk, 'Жасанды интеллектіні қауіпсіз және жауапкершілікпен пайдалану'),
          coalesce(nullif(trim(p->>'topic_ru'), ''), src.topic_ru, 'Безопасное и ответственное использование искусственного интеллекта'),
          coalesce((p->>'all_schools')::boolean, src.all_schools, true),
          coalesce(src.g2_min_percent, 50), coalesce(src.g2_min_completed, 1),
          coalesce(src.g3_min_percent, 75), coalesce(src.g3_min_level2, 1), coalesce(src.g3_min_vibe, 1),
          coalesce(src.require_prompt_for_level2, false), coalesce(src.min_prompt_length, 20),
          coalesce(src.min_text_length, 40),
          coalesce(src.product_choice, true), coalesce(src.platform_survey, true),
          coalesce(src.allow_files, true), coalesce(src.max_files, 3),
          coalesce(src.platform_options, public._default_platforms()))
  returning id into v_id;

  if src.id is not null then
    insert into tasks (campaign_id, key, kind, position, enabled, title_kk, title_ru, instruction_kk,
                       instruction_ru, tool_options, allow_text, prompt_mode, process_kk, process_ru,
                       extra_type, extra_question_kk, extra_question_ru, extra_options_kk, extra_options_ru)
    select v_id, key, kind, position, enabled, title_kk, title_ru, instruction_kk, instruction_ru,
           tool_options, allow_text, prompt_mode, process_kk, process_ru, extra_type,
           extra_question_kk, extra_question_ru, extra_options_kk, extra_options_ru
    from tasks where campaign_id = src.id;
    insert into campaign_schools (campaign_id, school_id)
    select v_id, school_id from campaign_schools where campaign_id = src.id;
  else
    perform public._insert_default_tasks(v_id);
  end if;
  return v_id;
end $$;

-- Қазіргі шектермен кампанияның барлық нәтижелерін қайта есептеу
create or replace function public.recalc_campaign(p_campaign uuid)
returns int language plpgsql volatile security definer set search_path = public as $$
declare r record; n int := 0;
begin
  perform public._require_super();
  for r in select id from submissions where campaign_id = p_campaign loop
    perform public._recalc_submission(r.id); n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.regenerate_school_code(p_school uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v text;
begin
  perform public._require_super();
  loop
    v := public.gen_code(6);
    exit when not exists (select 1 from schools where code = v);
  end loop;
  update schools set code = v where id = p_school;
  return v;
end $$;

create or replace function public.move_participant(p_participant uuid, p_school uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._require_super();
  update participants set school_id = p_school where id = p_participant;
  update submissions  set school_id = p_school where participant_id = p_participant;
  update answers set school_id = p_school
    where submission_id in (select id from submissions where participant_id = p_participant);
end $$;

-- ---------------------------------------------------------------------
-- 9. Статистика (RLS қолданылады — мектеп әкімшісі тек өз мектебін көреді)
-- ---------------------------------------------------------------------

create or replace function public._filtered_submissions(f jsonb)
returns setof public.submissions language sql stable security invoker set search_path = public as $$
  select s.* from submissions s join schools sc on sc.id = s.school_id
  where (nullif(f->>'school_id', '') is null or s.school_id = (f->>'school_id')::uuid)
    and (nullif(f->>'region', '') is null or sc.region = f->>'region')
    and (nullif(f->>'campaign_id', '') is null or s.campaign_id = (f->>'campaign_id')::uuid)
    and (nullif(f->>'group_no', '') is null or s.group_no = (f->>'group_no')::int)
    and (nullif(f->>'language', '') is null or s.language = f->>'language')
    and (nullif(f->>'date_from', '') is null or s.finished_at >= (f->>'date_from')::date)
    and (nullif(f->>'date_to', '') is null or s.finished_at < (f->>'date_to')::date + 1)
    and (coalesce((f->>'include_demo')::boolean, false) or not s.is_demo);
$$;

create or replace function public.stats_overview(f jsonb default '{}')
returns jsonb language sql stable security invoker set search_path = public as $$
  with s as (select * from public._filtered_submissions(f)),
  a as (select a.*, t.kind from answers a join s on s.id = a.submission_id left join tasks t on t.id = a.task_id)
  select jsonb_build_object(
    'schools', (select count(*) from schools sc
                where (coalesce((f->>'include_demo')::boolean, false) or not sc.is_demo)
                  and (nullif(f->>'region', '') is null or sc.region = f->>'region')
                  and (nullif(f->>'school_id', '') is null or sc.id = (f->>'school_id')::uuid)),
    'participants', (select count(*) from participants p join schools sc on sc.id = p.school_id
                where (coalesce((f->>'include_demo')::boolean, false) or not p.is_demo)
                  and (nullif(f->>'region', '') is null or sc.region = f->>'region')
                  and (nullif(f->>'school_id', '') is null or p.school_id = (f->>'school_id')::uuid)),
    'completed', (select count(*) from s),
    'avg_percent', (select round(avg(percent), 1) from s),
    'avg_tools', (select round(avg(tools_count), 1) from s),
    'groups', (select jsonb_build_object('1', count(*) filter (where group_no = 1),
                                         '2', count(*) filter (where group_no = 2),
                                         '3', count(*) filter (where group_no = 3)) from s),
    'skills', (select coalesce(jsonb_agg(x order by x->>'position', x->>'key'), '[]') from (
                 select jsonb_build_object('key', a.task_key,
                   'position', lpad(coalesce(min(t.position), 99)::text, 3, '0'),
                   'title_kk', min(t.title_kk), 'title_ru', min(t.title_ru),
                   'avg', round(avg(a.score), 2), 'n', count(*),
                   'n0', count(*) filter (where a.score = 0), 'n1', count(*) filter (where a.score = 1),
                   'n2', count(*) filter (where a.score = 2)) x
                 from a left join tasks t on t.id = a.task_id group by a.task_key) q),
    'tools', (select coalesce(jsonb_agg(jsonb_build_object('tool', tool, 'n', n) order by n desc, tool), '[]')
              from (select tool, count(*) n from s, unnest(s.tools_used) tool group by tool
                    order by count(*) desc limit 20) q),
    'platforms', (select coalesce(jsonb_agg(jsonb_build_object('name', key, 'know', know, 'master', master)
                                            order by master desc, know desc, key), '[]')
                  from (select e.key, count(*) filter (where e.value::int >= 1) know,
                               count(*) filter (where e.value::int = 2) master
                        from s, jsonb_each_text(s.platforms) e group by e.key) q),
    'platforms_responded', (select count(*) from s join campaigns c on c.id = s.campaign_id where c.platform_survey),
    'product_choices', (select coalesce(jsonb_agg(jsonb_build_object('key', q.chosen_task, 'n', q.n,
                          'title_kk', (select title_kk from tasks t where t.key = q.chosen_task limit 1),
                          'title_ru', (select title_ru from tasks t where t.key = q.chosen_task limit 1)) order by q.n desc), '[]')
                        from (select chosen_task, count(*) n from s where chosen_task is not null group by chosen_task) q),
    'vibe_scores', (select jsonb_build_object('0', count(*) filter (where score = 0),
                                              '1', count(*) filter (where score = 1),
                                              '2', count(*) filter (where score = 2))
                    from a where kind = 'vibe'),
    'vibe_self', (select jsonb_object_agg(vibe_self::text, n) from
                    (select vibe_self, count(*) n from s where vibe_self is not null group by vibe_self) q),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n, 'avg', av) order by d), '[]') from
                (select (finished_at at time zone 'Asia/Almaty')::date d, count(*) n, round(avg(percent), 1) av
                 from s group by 1 order by 1 desc limit 60) q),
    'by_campaign', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name_kk', c.name_kk, 'name_ru', c.name_ru,
                        'n', q.n, 'avg', q.av, 'g1', q.g1, 'g2', q.g2, 'g3', q.g3) order by c.created_at), '[]')
                    from (select campaign_id, count(*) n, round(avg(percent), 1) av,
                                 count(*) filter (where group_no = 1) g1, count(*) filter (where group_no = 2) g2,
                                 count(*) filter (where group_no = 3) g3
                          from s group by campaign_id) q join campaigns c on c.id = q.campaign_id)
  );
$$;

create or replace function public.school_stats(f jsonb default '{}')
returns jsonb language sql stable security invoker set search_path = public as $$
  with s as (select * from public._filtered_submissions(f))
  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.name), '[]') from (
    select sc.id, sc.name, sc.region, sc.city, sc.code, sc.is_demo, sc.status,
      (select count(*) from participants p where p.school_id = sc.id) as participants,
      (select count(*) from s where s.school_id = sc.id) as completed,
      (select count(*) from s where s.school_id = sc.id and group_no = 1) as g1,
      (select count(*) from s where s.school_id = sc.id and group_no = 2) as g2,
      (select count(*) from s where s.school_id = sc.id and group_no = 3) as g3,
      (select round(avg(percent), 1) from s where s.school_id = sc.id) as avg_percent,
      (select jsonb_object_agg(task_key, av) from
         (select a.task_key, round(avg(a.score), 2) av from answers a join s on s.id = a.submission_id
          where s.school_id = sc.id group by a.task_key) q) as skills,
      (select coalesce(jsonb_agg(tool order by n desc), '[]') from
         (select tool, count(*) n from s, unnest(s.tools_used) tool where s.school_id = sc.id
          group by tool order by count(*) desc limit 5) q) as top_tools
    from schools sc
    where (coalesce((f->>'include_demo')::boolean, false) or not sc.is_demo)
      and (nullif(f->>'region', '') is null or sc.region = f->>'region')
      and (nullif(f->>'school_id', '') is null or sc.id = (f->>'school_id')::uuid)
  ) r;
$$;

-- «Дейін / кейін» салыстыру
create or replace function public.compare_campaigns(p_a uuid, p_b uuid, p_school uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with sa as (select * from submissions where campaign_id = p_a and (p_school is null or school_id = p_school)),
       sb as (select * from submissions where campaign_id = p_b and (p_school is null or school_id = p_school)),
       ka as (select a.task_key, avg(a.score) av from answers a join sa on sa.id = a.submission_id group by 1),
       kb as (select a.task_key, avg(a.score) av from answers a join sb on sb.id = a.submission_id group by 1)
  select jsonb_build_object(
    'a', jsonb_build_object('n', (select count(*) from sa), 'avg', (select round(avg(percent), 1) from sa),
         'g1', (select count(*) from sa where group_no = 1), 'g2', (select count(*) from sa where group_no = 2),
         'g3', (select count(*) from sa where group_no = 3)),
    'b', jsonb_build_object('n', (select count(*) from sb), 'avg', (select round(avg(percent), 1) from sb),
         'g1', (select count(*) from sb where group_no = 1), 'g2', (select count(*) from sb where group_no = 2),
         'g3', (select count(*) from sb where group_no = 3)),
    'skills', (select coalesce(jsonb_agg(jsonb_build_object('key', k.key,
                  'title_kk', (select title_kk from tasks where key = k.key and campaign_id in (p_a, p_b) limit 1),
                  'title_ru', (select title_ru from tasks where key = k.key and campaign_id in (p_a, p_b) limit 1),
                  'a', round(ka.av, 2), 'b', round(kb.av, 2), 'delta', round(kb.av - ka.av, 2))
                  order by (select min(position) from tasks where key = k.key and campaign_id in (p_a, p_b)), k.key), '[]')
               from (select task_key as key from ka union select task_key from kb) k
               left join ka on ka.task_key = k.key left join kb on kb.task_key = k.key),
    'participants', (select coalesce(jsonb_agg(jsonb_build_object('participant_id', sa.participant_id,
                  'full_name', sa.full_name, 'school_id', sa.school_id,
                  'a_percent', sa.percent, 'b_percent', sb.percent, 'a_group', sa.group_no, 'b_group', sb.group_no,
                  'skills', (select jsonb_object_agg(x.task_key, jsonb_build_object('a', x.score, 'b', y.score))
                             from answers x left join answers y on y.submission_id = sb.id and y.task_key = x.task_key
                             where x.submission_id = sa.id))
                  order by sa.full_name), '[]')
               from sa join sb on sb.participant_id = sa.participant_id)
  );
$$;

-- ---------------------------------------------------------------------
-- 10. Демо-режим / демо-режим (DEMO DATA)
-- ---------------------------------------------------------------------

create or replace function public.seed_demo_data()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_c1 uuid; v_c2 uuid; sc record; i int; v_part uuid; t record; answers jsonb; lvl int; b int;
  names text[] := array['Айгерім Сейітова','Нұрлан Бекмұхамбетов','Дана Қасымова','Ерлан Жұмабаев',
    'Мәдина Төлегенова','Асель Нұрланқызы','Бауыржан Оспанов','Гүлнар Ахметова','Ольга Ким',
    'Сергей Петренко','Жанар Әбдірахманова','Қайрат Смағұлов'];
  tools text[] := array['ChatGPT','Gemini','Claude','Canva','Gamma','Microsoft Copilot'];
  schools_created int := 0; subs int := 0;
begin
  perform public._require_super();
  if exists (select 1 from schools where is_demo) then
    raise exception 'demo_exists' using errcode = 'P0001';
  end if;

  insert into schools (name, region, city, is_demo) values
    ('DEMO — №1 мектеп-гимназия', 'Алматы облысы', 'Қонаев', true),
    ('DEMO — №7 жалпы білім беретін мектеп', 'Астана', 'Астана', true),
    ('DEMO — НЗМ (демо)', 'Шымкент', 'Шымкент', true);
  schools_created := 3;

  insert into campaigns (name_kk, name_ru, topic_kk, topic_ru, status, all_schools, is_demo, published_at, created_at)
  values ('DEMO — Оқуға дейін', 'DEMO — До обучения',
          'Жасанды интеллектіні қауіпсіз және жауапкершілікпен пайдалану',
          'Безопасное и ответственное использование искусственного интеллекта',
          'closed', true, true, now() - interval '60 days', now() - interval '60 days')
  returning id into v_c1;
  perform public._insert_default_tasks(v_c1);
  insert into campaigns (name_kk, name_ru, topic_kk, topic_ru, status, all_schools, is_demo, published_at, created_at)
  values ('DEMO — Оқудан кейін', 'DEMO — После обучения',
          'Жасанды интеллектіні қауіпсіз және жауапкершілікпен пайдалану',
          'Безопасное и ответственное использование искусственного интеллекта',
          'published', true, true, now(), now())
  returning id into v_c2;
  perform public._insert_default_tasks(v_c2);

  for sc in select id, row_number() over (order by name) rn from schools where is_demo loop
    for i in 1 .. 8 loop
      insert into participants (school_id, full_name, position, is_demo)
      values (sc.id, names[1 + ((i + sc.rn * 3) % array_length(names, 1))] || ' (' || sc.rn || '-' || i || ')',
              case when i % 4 = 0 then 'Директордың орынбасары' else 'Мұғалім' end, true)
      returning id into v_part;
      b := (i + sc.rn) % 3;  -- бастапқы деңгей
      -- «Дейін»
      answers := '[]';
      for t in select * from tasks where campaign_id = v_c1 order by position loop
        lvl := least(2, greatest(0, b + ((i * t.position) % 3) - 1));
        if t.kind = 'vibe' then lvl := least(lvl, b); end if;
        answers := answers || jsonb_build_array(jsonb_build_object(
          'task_key', t.key, 'process_level', lvl,
          'tools', to_jsonb(array[tools[1 + (i + t.position) % 6]]),
          'link', case when lvl > 0 then 'https://example.com/demo/' || t.key || '/' || i end,
          'result_text', case when t.allow_text and lvl > 0 then repeat('Демо ҚМЖ фрагменті. ', 4) end,
          'prompt_text', case when lvl > 0 then 'Демо промпт: 7-сынып, сабақ мақсаттары, бағалау критерийлері' end,
          'extra_answer', case when t.kind = 'vibe' then to_jsonb(array[least(4, b + lvl)]) else '[]'::jsonb end,
          'time_seconds', 60 + (i * 17) % 90));
      end loop;
      perform public._create_submission(jsonb_build_object('language', case when i % 3 = 0 then 'ru' else 'kk' end,
        'chosen_task', (array['infographic','worksheet','presentation','kmzh'])[1 + ((i + sc.rn::int) % 4)],
        'platforms', (select jsonb_object_agg(x, 1 + ((i + n) % 2)) from unnest(public._default_platforms()) with ordinality u(x, n)
                      where (n + i + sc.rn) % 3 = 0),
        'position', 'Мұғалім', 'finished_at', now() - interval '59 days' + (i || ' hours')::interval,
        'started_at', now() - interval '59 days' + (i || ' hours')::interval - interval '9 minutes',
        'answers', answers), sc.id, v_c1, v_part, true);
      subs := subs + 1;
      -- «Кейін» (бірінші 6 қатысушы)
      if i <= 6 then
        answers := '[]';
        for t in select * from tasks where campaign_id = v_c2 order by position loop
          lvl := least(2, greatest(0, b + ((i * t.position) % 3)));
          answers := answers || jsonb_build_array(jsonb_build_object(
            'task_key', t.key, 'process_level', lvl,
            'tools', to_jsonb(array[tools[1 + (i + t.position) % 6], tools[1 + (i + t.position + 2) % 6]]),
            'link', case when lvl > 0 then 'https://example.com/demo2/' || t.key || '/' || i end,
            'result_text', case when t.allow_text and lvl > 0 then repeat('Демо ҚМЖ фрагменті. ', 4) end,
            'prompt_text', case when lvl > 0 then 'Демо промпт: 7-сынып, сабақ мақсаттары, бағалау критерийлері' end,
            'extra_answer', case when t.kind = 'vibe' then to_jsonb(array[least(4, b + lvl + 1)]) else '[]'::jsonb end,
            'time_seconds', 50 + (i * 13) % 80));
        end loop;
        perform public._create_submission(jsonb_build_object('language', case when i % 3 = 0 then 'ru' else 'kk' end,
          'chosen_task', (array['infographic','worksheet','presentation','kmzh'])[1 + ((i + sc.rn::int + 1) % 4)],
          'platforms', (select jsonb_object_agg(x, 1 + ((i + n + 1) % 2)) from unnest(public._default_platforms()) with ordinality u(x, n)
                        where (n + i + sc.rn) % 2 = 0),
          'position', 'Мұғалім', 'finished_at', now() - ((7 - i) || ' days')::interval,
          'started_at', now() - ((7 - i) || ' days')::interval - interval '8 minutes',
          'answers', answers), sc.id, v_c2, v_part, true);
        subs := subs + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('schools', schools_created, 'submissions', subs);
end $$;

create or replace function public.delete_demo_data()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare n_s int; n_c int;
begin
  perform public._require_super();
  delete from submissions where is_demo;
  delete from participants where is_demo;
  with d as (delete from schools where is_demo and not exists
               (select 1 from profiles p where p.school_id = schools.id) returning 1)
    select count(*) into n_s from d;
  with d as (delete from campaigns where is_demo returning 1) select count(*) into n_c from d;
  return jsonb_build_object('schools', n_s, 'campaigns', n_c);
end $$;

-- ---------------------------------------------------------------------
-- 11. Құқықтар / права на функции
-- ---------------------------------------------------------------------

revoke execute on function public._auto_score(public.tasks, public.campaigns, int, text, text, text, int) from public, anon, authenticated;
revoke execute on function public._evidence_exists(text) from public, anon, authenticated;
revoke execute on function public._recalc_submission(uuid) from public, anon, authenticated;
revoke execute on function public._answers_score_changed() from public, anon, authenticated;
revoke execute on function public._insert_default_tasks(uuid) from public, anon, authenticated;
revoke execute on function public._find_campaign(uuid, text) from public, anon, authenticated;
revoke execute on function public._create_submission(jsonb, uuid, uuid, uuid, boolean) from public, anon, authenticated;

revoke execute on function public.create_campaign(jsonb) from public, anon;
revoke execute on function public.recalc_campaign(uuid) from public, anon;
revoke execute on function public.regenerate_school_code(uuid) from public, anon;
revoke execute on function public.move_participant(uuid, uuid) from public, anon;
revoke execute on function public.seed_demo_data() from public, anon;
revoke execute on function public.delete_demo_data() from public, anon;
revoke execute on function public.stats_overview(jsonb) from public, anon;
revoke execute on function public.school_stats(jsonb) from public, anon;
revoke execute on function public.compare_campaigns(uuid, uuid, uuid) from public, anon;
revoke execute on function public._filtered_submissions(jsonb) from public, anon;

grant execute on function public.get_diagnostic(text, text, text) to anon, authenticated;
grant execute on function public.submit_diagnostic(jsonb) to anon, authenticated;
grant execute on function public.get_result(uuid) to anon, authenticated;
grant execute on function public.create_campaign(jsonb), public.recalc_campaign(uuid),
      public.regenerate_school_code(uuid), public.move_participant(uuid, uuid),
      public.seed_demo_data(), public.delete_demo_data(), public.stats_overview(jsonb),
      public.school_stats(jsonb), public.compare_campaigns(uuid, uuid, uuid),
      public._filtered_submissions(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 12. Бірінші диагностикалық кампания (жоба бос болса)
-- ---------------------------------------------------------------------
do $$
declare v uuid;
begin
  if not exists (select 1 from campaigns where not is_demo) then
    insert into campaigns (name_kk, name_ru, topic_kk, topic_ru, status, published_at)
    values ('AI Skills Diagnostic — 2026 қыркүйек', 'AI Skills Diagnostic — сентябрь 2026',
            'Жасанды интеллектіні қауіпсіз және жауапкершілікпен пайдалану',
            'Безопасное и ответственное использование искусственного интеллекта',
            'draft', null)
    returning id into v;
    perform public._insert_default_tasks(v);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 13. Файл-дәлелдер: Supabase Storage «evidence» бакеті (жабық) және оқу құқығы
--     Педагог файлды тек сервер берген бір реттік сілтеме арқылы жүктейді (api/admin.js → upload_url).
--     Оқу: SUPER ADMIN — барлығы, SCHOOL ADMIN — тек өз мектебінің қалтасы.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('evidence', 'evidence', false, 10485760, array[
      'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
      'application/pdf','text/plain','text/html',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists "evidence_admin_read" on storage.objects';
    execute $p$create policy "evidence_admin_read" on storage.objects for select to authenticated
      using (bucket_id = 'evidence' and ((select public.is_super_admin())
             or (storage.foldername(name))[1] = (select public.my_school_id())::text))$p$;
    execute 'drop policy if exists "evidence_super_delete" on storage.objects';
    execute $p$create policy "evidence_super_delete" on storage.objects for delete to authenticated
      using (bucket_id = 'evidence' and (select public.is_super_admin()))$p$;
  end if;
end $$;

-- Бұрын орнатылған жүйе үшін: нәтижесі жоқ жоба-диагностикаларға жаңа әдепкі шектер
update public.campaigns c set g2_min_percent = 50, g2_min_completed = 1, g3_min_level2 = 1, g3_min_vibe = 1,
  product_choice = true
where c.status = 'draft' and c.g2_min_percent = 40 and c.g2_min_completed = 2 and c.g3_min_level2 = 3
  and not exists (select 1 from public.submissions s where s.campaign_id = c.id);

notify pgrst, 'reload schema';
