-- =====================================================================
-- AI Skills Diagnostic — КУРС / КАБИНЕТ ПЕДАГОГА (v2.0)
-- schema.sql-дан КЕЙІН іске қосыңыз. Қайта іске қосуға қауіпсіз.
-- Запускать ПОСЛЕ schema.sql. Повторный запуск безопасен.
-- Бар диагностикаға (tasks, submissions, answers) ештеңе өзгертпейді.
-- Существующую диагностику не меняет.
-- =====================================================================

set client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 1. Курс модульдері / модули курса
-- ---------------------------------------------------------------------
create table if not exists public.course_modules (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null unique check (key ~ '^[a-z0-9_]{2,40}$'),
  group_no           int  not null check (group_no in (1, 2, 3)),
  position           int  not null default 0,
  enabled            boolean not null default true,
  title_kk           text not null,
  title_ru           text not null,
  goal_kk            text not null default '',
  goal_ru            text not null default '',
  steps_kk           text not null default '',       -- әр қадам жаңа жолда / шаги с новой строки
  steps_ru           text not null default '',
  task_kk            text not null default '',
  task_ru            text not null default '',
  rubric             jsonb not null default '[]'::jsonb, -- [{"kk": "...", "ru": "..."}], әр критерий 0–2
  services           text[] not null default '{}',   -- ЖИ кітапханасынан сервистер
  video_url          text,                            -- «Бонустар» бейнесі
  prompt_url         text,                            -- Ұстаз Промпт ішіндегі генератор
  min_prompt_length  int not null default 30,
  min_text_length    int not null default 40,
  min_reflection     int not null default 30,
  pass_percent       int not null default 50 check (pass_percent between 0 and 100),
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Педагог жұмыстары (жинақ) / работы педагога (копилка)
-- ---------------------------------------------------------------------
create table if not exists public.course_works (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references public.participants (id) on delete cascade,
  school_id       uuid not null references public.schools (id) on delete cascade,
  module_id       uuid not null references public.course_modules (id) on delete cascade,
  module_key      text not null,
  status          text not null check (status in ('accepted', 'needs_rework')),
  language        text not null default 'kk' check (language in ('kk', 'ru')),
  prompt_text     text,
  result_text     text,
  link            text,
  files           jsonb not null default '[]'::jsonb,   -- [{path,name,size,type,sha256}]
  reflection      text,
  checks          jsonb not null default '{}'::jsonb,   -- 1–2 қабат нәтижесі / результаты слоёв 1–2
  ai_scores       jsonb,                                 -- [0..2, ...] критерийлер бойынша
  ai_feedback     text,
  ai_confidence   numeric(3, 2),
  score           int not null default 0,
  max_score       int not null default 0,
  duplicate       boolean not null default false,
  file_hashes     text[] not null default '{}',
  text_hash       text,
  link_norm       text,
  attempts        int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (participant_id, module_id)
);

create index if not exists idx_course_modules_group on public.course_modules (group_no, position);
create index if not exists idx_course_works_school  on public.course_works (school_id);
create index if not exists idx_course_works_part    on public.course_works (participant_id);
create index if not exists idx_course_works_hashes  on public.course_works using gin (file_hashes);
create index if not exists idx_course_works_text    on public.course_works (text_hash);
create index if not exists idx_course_works_link    on public.course_works (link_norm);

-- ---------------------------------------------------------------------
-- 3. RLS: SUPER ADMIN — бәрі, SCHOOL ADMIN — өз мектебі, педагог — тек RPC арқылы
-- ---------------------------------------------------------------------
alter table public.course_modules enable row level security;
alter table public.course_works   enable row level security;

grant select, insert, update, delete on public.course_modules, public.course_works to authenticated;
grant all on public.course_modules, public.course_works to service_role;
revoke all on public.course_modules, public.course_works from anon;

drop policy if exists super_all on public.course_modules;
create policy super_all on public.course_modules for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
drop policy if exists school_read on public.course_modules;
create policy school_read on public.course_modules for select to authenticated
  using ((select public.my_school_id()) is not null);

drop policy if exists super_all on public.course_works;
create policy super_all on public.course_works for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
drop policy if exists school_read on public.course_works;
create policy school_read on public.course_works for select to authenticated
  using (school_id = (select public.my_school_id()));

-- ---------------------------------------------------------------------
-- 4. Педагогтің қазіргі тобы / текущая группа педагога (соңғы диагностика)
-- ---------------------------------------------------------------------
create or replace function public._current_group(p_participant uuid)
returns int language sql stable security definer set search_path = public as $$
  select s.group_no from submissions s
  where s.participant_id = p_participant
  order by s.finished_at desc limit 1;
$$;

create or replace function public._find_participant(p_personal_code text)
returns public.participants language plpgsql stable security definer set search_path = public as $$
declare pa participants; sc schools;
begin
  select * into pa from participants where personal_code = upper(trim(coalesce(p_personal_code, '')));
  if not found then raise exception 'personal_code_not_found' using errcode = 'P0001'; end if;
  select * into sc from schools where id = pa.school_id;
  if sc.status <> 'active' then raise exception 'school_inactive' using errcode = 'P0001'; end if;
  return pa;
end $$;

-- ---------------------------------------------------------------------
-- 5. Кабинет / кабинет педагога (anon, жеке код арқылы)
-- ---------------------------------------------------------------------
create or replace function public.get_cabinet(p_personal_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  pa participants; sc schools; v_group int;
begin
  pa := public._find_participant(p_personal_code);
  select * into sc from schools where id = pa.school_id;
  v_group := public._current_group(pa.id);

  return jsonb_build_object(
    'participant', jsonb_build_object('full_name', pa.full_name, 'position', pa.position,
                                      'personal_code', pa.personal_code),
    'school', jsonb_build_object('name', sc.name, 'city', sc.city, 'is_demo', sc.is_demo),
    'group_no', v_group,
    -- Диагностика тарихы (өсуді көрсету үшін) / история диагностик (для роста)
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'campaign_kk', c.name_kk, 'campaign_ru', c.name_ru, 'finished_at', s.finished_at,
               'group_no', s.group_no, 'percent', s.percent, 'result_token', s.result_token)
             order by s.finished_at)
      from submissions s join campaigns c on c.id = s.campaign_id
      where s.participant_id = pa.id), '[]'::jsonb),
    -- Өз тобының модульдері / модули своей группы
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', m.key, 'group_no', m.group_no, 'title_kk', m.title_kk, 'title_ru', m.title_ru,
               'goal_kk', m.goal_kk, 'goal_ru', m.goal_ru,
               'status', w.status, 'score', w.score, 'max_score', w.max_score, 'updated_at', w.updated_at)
             order by m.position, m.key)
      from course_modules m
      left join course_works w on w.module_id = m.id and w.participant_id = pa.id
      where m.enabled and m.group_no = v_group), '[]'::jsonb),
    -- Жинақ: барлық жұмыстар / копилка: все работы
    'works', coalesce((
      select jsonb_agg(jsonb_build_object(
               'module_key', w.module_key, 'title_kk', m.title_kk, 'title_ru', m.title_ru,
               'group_no', m.group_no, 'status', w.status, 'score', w.score, 'max_score', w.max_score,
               'link', w.link, 'files', (select coalesce(jsonb_agg(jsonb_build_object('name', f->>'name')), '[]'::jsonb)
                                         from jsonb_array_elements(w.files) f),
               'updated_at', w.updated_at)
             order by w.updated_at desc)
      from course_works w join course_modules m on m.id = w.module_id
      where w.participant_id = pa.id), '[]'::jsonb)
  );
end $$;

create or replace function public.get_course_module(p_personal_code text, p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  pa participants; m course_modules; w course_works; v_group int;
begin
  pa := public._find_participant(p_personal_code);
  select * into m from course_modules where key = lower(trim(coalesce(p_key, ''))) and enabled;
  if not found then raise exception 'module_not_found' using errcode = 'P0001'; end if;
  v_group := public._current_group(pa.id);
  select * into w from course_works where participant_id = pa.id and module_id = m.id;

  return jsonb_build_object(
    'participant', jsonb_build_object('full_name', pa.full_name, 'personal_code', pa.personal_code),
    'group_no', v_group,
    'locked', v_group is null or v_group <> m.group_no,
    'module', jsonb_build_object(
      'key', m.key, 'group_no', m.group_no, 'title_kk', m.title_kk, 'title_ru', m.title_ru,
      'goal_kk', m.goal_kk, 'goal_ru', m.goal_ru, 'steps_kk', m.steps_kk, 'steps_ru', m.steps_ru,
      'task_kk', m.task_kk, 'task_ru', m.task_ru, 'rubric', m.rubric, 'services', to_jsonb(m.services),
      'video_url', m.video_url, 'prompt_url', m.prompt_url,
      'min_prompt_length', m.min_prompt_length, 'min_text_length', m.min_text_length,
      'min_reflection', m.min_reflection, 'pass_percent', m.pass_percent),
    'work', case when w.id is null then null else jsonb_build_object(
      'status', w.status, 'prompt_text', w.prompt_text, 'result_text', w.result_text, 'link', w.link,
      'files', w.files, 'reflection', w.reflection, 'checks', w.checks, 'ai_scores', w.ai_scores,
      'ai_feedback', w.ai_feedback, 'score', w.score, 'max_score', w.max_score,
      'attempts', w.attempts, 'updated_at', w.updated_at) end
  );
end $$;

-- ---------------------------------------------------------------------
-- 6. Нәтиже бетінен кабинетке сілтеме / ссылка в кабинет со страницы результата
-- ---------------------------------------------------------------------
create or replace function public.get_result(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'full_name', s.full_name, 'school', sc.name, 'finished_at', s.finished_at,
    'language', s.language, 'group_no', s.group_no,
    'campaign_kk', c.name_kk, 'campaign_ru', c.name_ru,
    'personal_code', pa.personal_code,
    'completed_tasks', (select coalesce(jsonb_agg(jsonb_build_object('title_kk', t.title_kk, 'title_ru', t.title_ru,
                                                      'done', a.score > 0) order by t.position), '[]'::jsonb)
                        from answers a join tasks t on t.id = a.task_id where a.submission_id = s.id))
  from submissions s join schools sc on sc.id = s.school_id join campaigns c on c.id = s.campaign_id
  join participants pa on pa.id = s.participant_id
  where s.result_token = p_token;
$$;

-- ---------------------------------------------------------------------
-- 7. Әкімшіге арналған курс статистикасы (RLS қолданылады)
-- ---------------------------------------------------------------------
create or replace function public.course_overview(p_school uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with part as (
    select p.id, p.school_id, public._current_group(p.id) as g
    from participants p
    where not p.is_demo and (p_school is null or p.school_id = p_school)
  ), mods as (
    select * from course_modules where enabled
  )
  select jsonb_build_object(
    'participants', (select count(*) from part),
    'diagnosed',    (select count(*) from part where g is not null),
    'by_group',     (select jsonb_build_object('1', count(*) filter (where g = 1), '2', count(*) filter (where g = 2),
                                               '3', count(*) filter (where g = 3)) from part),
    'started',      (select count(distinct w.participant_id) from course_works w join part on part.id = w.participant_id),
    'with_accepted',(select count(distinct w.participant_id) from course_works w join part on part.id = w.participant_id
                     where w.status = 'accepted'),
    'rework_total', (select count(*) from course_works w join part on part.id = w.participant_id where w.status = 'needs_rework'),
    -- Тәлімгер бола алатындар: 3-топ + кемінде бір қабылданған жұмыс / потенциальные наставники
    'mentors',      (select count(*) from part where g = 3 and exists (select 1 from course_works w
                       where w.participant_id = part.id and w.status = 'accepted')),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'position', p.position, 'personal_code', p.personal_code,
        'school', sc.name, 'group_no', part.g,
        'accepted', (select count(*) from course_works w where w.participant_id = p.id and w.status = 'accepted'),
        'rework',   (select count(*) from course_works w where w.participant_id = p.id and w.status = 'needs_rework'),
        'modules',  (select count(*) from mods m where m.group_no = part.g),
        'last_work', (select max(w.updated_at) from course_works w where w.participant_id = p.id))
      order by part.g nulls first, p.full_name)
      from part join participants p on p.id = part.id join schools sc on sc.id = p.school_id), '[]'::jsonb),
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
        'key', m.key, 'group_no', m.group_no, 'title_kk', m.title_kk, 'title_ru', m.title_ru,
        'eligible', (select count(*) from part where g = m.group_no),
        'accepted', (select count(*) from course_works w join part on part.id = w.participant_id
                     where w.module_id = m.id and w.status = 'accepted'),
        'rework',   (select count(*) from course_works w join part on part.id = w.participant_id
                     where w.module_id = m.id and w.status = 'needs_rework'))
      order by m.group_no, m.position) from mods m), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- 8. Құқықтар / права
-- ---------------------------------------------------------------------
revoke execute on function public._current_group(uuid) from public, anon, authenticated;
revoke execute on function public._find_participant(text) from public, anon, authenticated;
revoke execute on function public.course_overview(uuid) from public, anon;
grant execute on function public._current_group(uuid) to authenticated;   -- course_overview ішінде (RLS бар)
grant execute on function public.get_cabinet(text) to anon, authenticated;
grant execute on function public.get_course_module(text, text) to anon, authenticated;
grant execute on function public.get_result(uuid) to anon, authenticated;
grant execute on function public.course_overview(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Алғашқы үш модуль (әр топқа біреуден) / первые три модуля (по одному на группу)
--    Мазмұнын кейін өзгертуге болады (Table Editor → course_modules).
-- ---------------------------------------------------------------------
insert into public.course_modules (key, group_no, position, title_kk, title_ru, goal_kk, goal_ru,
                                   steps_kk, steps_ru, task_kk, task_ru, rubric, services)
values
('worksheet_ai', 1, 1,
 'ЖИ көмегімен жұмыс парағы',
 'Рабочий лист с помощью ИИ',
 'Өз пәніңіздің тақырыбына ЖИ көмегімен жұмыс парағын жасап, оны тексеріп, сабаққа дайындау.',
 'Сделать с помощью ИИ рабочий лист к теме своего предмета, проверить его и подготовить к уроку.',
 $s$Жақын сабағыңыздың тақырыбын таңдаңыз.
Ұстаз Промпт-та «Жұмыс парағы» түрін ашып, сыныпты, тақырыпты, тапсырма санын және тілді толтырыңыз.
Дайын промптты ЖИ-ге (ChatGPT, Gemini т.б.) қойыңыз.
Жауапты тексеріңіз: қателерді түзетіп, сыныбыңызға бейімдеңіз.
Жұмыс парағын файл немесе сілтеме ретінде жүктеп, промптты қосыңыз.$s$,
 $s$Выберите тему ближайшего урока.
В Ұстаз Промпт откройте тип «Рабочий лист», заполните класс, тему, число заданий и язык.
Вставьте готовый промпт в ИИ (ChatGPT, Gemini и др.).
Проверьте ответ: исправьте ошибки и адаптируйте под свой класс.
Загрузите рабочий лист файлом или ссылкой и приложите промпт.$s$,
 'Жақын сабағыңызға 5–8 тапсырмасы бар жұмыс парағын жасаңыз. Промптты, дайын парақты, қысқа сипаттаманы және рефлексияны жүктеңіз.',
 'Сделайте рабочий лист на 5–8 заданий к ближайшему уроку. Загрузите промпт, готовый лист, короткое описание и рефлексию.',
 '[{"kk":"Тақырыпқа және сыныпқа сәйкес келеді","ru":"Соответствует теме и классу"},
   {"kk":"Тапсырмалар түсінікті және қатесіз","ru":"Задания понятны и без ошибок"},
   {"kk":"Сабақта бірден қолдануға дайын","ru":"Готов к использованию на уроке"},
   {"kk":"Промпт толық: рөл, міндет, сынып, формат, тіл","ru":"Промпт полный: роль, задача, класс, формат, язык"},
   {"kk":"Педагог ЖИ нәтижесін өзі өңдеген","ru":"Педагог сам доработал результат ИИ"}]'::jsonb,
 array['ChatGPT','Gemini','Canva']),

('differentiation', 2, 1,
 'Саралау: үш деңгейлі тапсырмалар',
 'Дифференциация: задания трёх уровней',
 'Бір тақырыпқа үш деңгейлі (A, B, C) тапсырмалар мен дескрипторлар жасап, әр оқушыға лайықты жүктеме беру.',
 'Сделать к одной теме задания трёх уровней (A, B, C) с дескрипторами, чтобы дать каждому ученику посильную нагрузку.',
 $s$Сыныбыңызды сипаттаңыз: үлгерімі әртүрлі оқушылар, қиындықтар.
Ұстаз Промпт-та тапсырма генераторын ашып, үш деңгейді және дескрипторларды көрсетіңіз.
ЖИ жауабын тексеріңіз: деңгейлер шынымен күрделілігі бойынша ерекшелене ме?
Қажет болса, ЖИ-мен диалогта нақтылаңыз (2–3 рет).
Дайын жиынды жүктеп, промптты және рефлексияны қосыңыз.$s$,
 $s$Опишите свой класс: ученики с разной успеваемостью, трудности.
В Ұстаз Промпт откройте генератор заданий, укажите три уровня и дескрипторы.
Проверьте ответ ИИ: действительно ли уровни отличаются по сложности?
При необходимости уточните в диалоге с ИИ (2–3 раза).
Загрузите готовый набор, приложите промпт и рефлексию.$s$,
 'Бір тақырып бойынша үш деңгейлі тапсырмалар жиынын (әр деңгейге кемінде 2 тапсырма) және дескрипторларды жасаңыз.',
 'Сделайте набор заданий трёх уровней по одной теме (минимум 2 задания на уровень) с дескрипторами.',
 '[{"kk":"Деңгейлер күрделілігі бойынша анық ерекшеленеді","ru":"Уровни явно различаются по сложности"},
   {"kk":"Дескрипторлар нақты және өлшенетін","ru":"Дескрипторы конкретны и измеримы"},
   {"kk":"Тақырыпқа және сыныпқа сәйкес","ru":"Соответствует теме и классу"},
   {"kk":"Промптта сынып пен деңгейлер сипатталған","ru":"В промпте описаны класс и уровни"},
   {"kk":"Педагог ЖИ-мен нақтылап, нәтижені өңдеген","ru":"Педагог уточнял в диалоге и доработал результат"}]'::jsonb,
 array['ChatGPT','Gemini','MagicSchool']),

('vibe_trainer', 3, 1,
 'Вайб-кодинг: өз тренажеріңіз',
 'Вайб-кодинг: свой тренажёр',
 'ЖИ көмегімен пәніңізге арналған интерактивті тренажер немесе ойын жасап, сілтеме арқылы жариялау.',
 'Создать с помощью ИИ интерактивный тренажёр или игру по своему предмету и опубликовать по ссылке.',
 $s$Тренажердің тақырыбы мен оқу мақсатын анықтаңыз.
Промптта ойын ережесін, деңгейлерді, кері байланысты және тілді сипаттаңыз (бір HTML файл, API кілттерсіз).
ЖИ жасаған нұсқаны ашып, тексеріңіз.
Қателерін ЖИ-мен 2–3 рет түзетіңіз.
Жариялаңыз (Claude Artifact, Netlify, GitHub Pages т.б.) және сілтемені жүктеңіз.$s$,
 $s$Определите тему тренажёра и учебную цель.
В промпте опишите правила, уровни, обратную связь и язык (один HTML-файл, без API-ключей).
Откройте версию, созданную ИИ, и проверьте её.
Исправьте ошибки вместе с ИИ 2–3 раза.
Опубликуйте (Claude Artifact, Netlify, GitHub Pages и т.д.) и загрузите ссылку.$s$,
 'Сабағыңызға арналған тренажерді жасаңыз. Сілтемесін, негізгі промптты, қысқа сипаттаманы және рефлексияны жүктеңіз.',
 'Сделайте тренажёр к своему уроку. Загрузите ссылку, основной промпт, короткое описание и рефлексию.',
 '[{"kk":"Тренажер ашылады және жұмыс істейді","ru":"Тренажёр открывается и работает"},
   {"kk":"Оқу мақсатына сәйкес","ru":"Соответствует учебной цели"},
   {"kk":"Оқушыға кері байланыс береді","ru":"Даёт ученику обратную связь"},
   {"kk":"Промпт ережелерді нақты сипаттайды","ru":"Промпт чётко описывает правила"},
   {"kk":"Педагог нұсқаны бірнеше рет жетілдірген","ru":"Педагог несколько раз улучшал версию"}]'::jsonb,
 array['Claude','ChatGPT','Lovable','Cursor'])
on conflict (key) do nothing;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 10. 1-топқа қосымша екі модуль / ещё два модуля для группы 1 (v2.1)
--     Маршрут: 1) ЖИ-мен танысу → 2) Промпт формуласы → 3) Жұмыс парағы
-- ---------------------------------------------------------------------
insert into public.course_modules (key, group_no, position, title_kk, title_ru, goal_kk, goal_ru,
                                   steps_kk, steps_ru, task_kk, task_ru, rubric, services)
values
('ai_intro', 1, 1,
 'ЖИ-мен танысу: мүмкіндігі, шегі, қауіпсіздік',
 'Знакомство с ИИ: возможности, границы, безопасность',
 'ЖИ не істей алатынын және қай жерде қателесетінін өз көзіңізбен көру, оқушылар деректерін қорғау ережелерін бекіту.',
 'Своими глазами увидеть, что умеет ИИ и где он ошибается, и закрепить правила защиты данных учеников.',
 $s$Кез келген ЖИ-чатты ашыңыз (ChatGPT, Gemini т.б.).
Өз пәніңіздің бір тақырыбы бойынша 3 сұрақ қойыңыз: түсіндіру, мысал, есеп/тапсырма.
Жауаптарды оқулықпен салыстырыңыз: кемінде бір дәлсіздікті немесе қатені табыңыз.
Ойланыңыз: ЖИ-ге қандай деректерді енгізуге болмайды (оқушылардың аты-жөні, бағалары, ЖСН т.б.).
«Менің ЖИ-мен жұмыс ережелерім» атты 5 ережеден тұратын жадынама жасап, скриншот немесе файл жүктеңіз.$s$,
 $s$Откройте любой ИИ-чат (ChatGPT, Gemini и др.).
Задайте 3 вопроса по одной теме своего предмета: объяснение, пример, задача/задание.
Сравните ответы с учебником: найдите хотя бы одну неточность или ошибку.
Подумайте: какие данные нельзя вводить в ИИ (ФИО учеников, оценки, ИИН и т.д.).
Сделайте памятку «Мои правила работы с ИИ» из 5 правил и загрузите скриншот или файл.$s$,
 'ЖИ-ге қойған сұрағыңызды промпт өрісіне, табылған қатені сипаттамаға жазыңыз және 5 ережеден тұратын жадынаманы жүктеңіз.',
 'Вставьте свой вопрос ИИ в поле промпта, опишите найденную ошибку и загрузите памятку из 5 правил.',
 '[{"kk":"ЖИ жауабынан нақты қате немесе дәлсіздік табылған","ru":"В ответе ИИ найдена конкретная ошибка или неточность"},
   {"kk":"Қате дереккөзбен (оқулық т.б.) тексерілген","ru":"Ошибка проверена по источнику (учебник и др.)"},
   {"kk":"Ережелерде оқушылар деректерін қорғау бар","ru":"В правилах есть защита данных учеников"},
   {"kk":"Ережелер нақты және өз жұмысына қатысты","ru":"Правила конкретны и относятся к своей работе"},
   {"kk":"Рефлексияда ЖИ-дің шегі түсінілген","ru":"В рефлексии понятны границы ИИ"}]'::jsonb,
 array['ChatGPT','Gemini','Perplexity']),

('prompt_formula', 1, 2,
 'Промпт формуласы: рөл, міндет, сынып, формат, тіл',
 'Формула промпта: роль, задача, класс, формат, язык',
 'Нақты нәтиже беретін промпт жазуды үйрену: әлсіз және күшті промпттың айырмасын көру.',
 'Научиться писать промпт, который даёт точный результат: увидеть разницу между слабым и сильным промптом.',
 $s$Алдымен қысқа «әлсіз» промпт жазыңыз, мысалы: «Бөлшектер туралы тапсырма бер».
Енді Ұстаз Промпт-та сол материалды жасаңыз: рөл, міндет, сынып, тақырып, формат, тіл, шектеулер.
Екі промптты ЖИ-ге беріп, нәтижелерін салыстырыңыз.
Күшті промптты тағы бір рет нақтылаңыз (мысалы, деңгей немесе уақыт қосыңыз).
Екі нәтиженің скриншотын немесе файлын жүктеп, ең жақсы промптты қойыңыз.$s$,
 $s$Сначала напишите короткий «слабый» промпт, например: «Дай задание про дроби».
Теперь сделайте тот же материал в Ұстаз Промпт: роль, задача, класс, тема, формат, язык, ограничения.
Отправьте оба промпта в ИИ и сравните результаты.
Уточните сильный промпт ещё раз (например, добавьте уровень или время).
Загрузите скриншот или файл обоих результатов и вставьте лучший промпт.$s$,
 'Өз пәніңізге 1 әлсіз және 1 күшті промпт жазып, нәтижелерін салыстырыңыз. Күшті промптты, салыстыру сипаттамасын және рефлексияны жүктеңіз.',
 'Напишите для своего предмета 1 слабый и 1 сильный промпт и сравните результаты. Загрузите сильный промпт, описание сравнения и рефлексию.',
 '[{"kk":"Промптта рөл мен міндет көрсетілген","ru":"В промпте указаны роль и задача"},
   {"kk":"Сынып, тақырып және формат нақты","ru":"Класс, тема и формат конкретны"},
   {"kk":"Тіл мен шектеулер көрсетілген","ru":"Указаны язык и ограничения"},
   {"kk":"Әлсіз және күшті нәтиже салыстырылған","ru":"Слабый и сильный результаты сравнены"},
   {"kk":"Промпт кемінде бір рет нақтыланған","ru":"Промпт хотя бы раз уточнён"}]'::jsonb,
 array['ChatGPT','Gemini','Claude'])
on conflict (key) do nothing;

-- Жұмыс парағы енді үшінші қадам / рабочий лист теперь третий шаг
update public.course_modules set position = 3 where key = 'worksheet_ai' and position = 1;

notify pgrst, 'reload schema';

-- Ұстаз Промпт ішіндегі нақты генераторға сілтемелер (сайттың /ustaz/ бетінде)
update public.course_modules set prompt_url = '?item=Рабочий лист'             where key = 'worksheet_ai'    and prompt_url is null;
update public.course_modules set prompt_url = '?item=Дифференцированные задания' where key = 'differentiation' and prompt_url is null;
update public.course_modules set prompt_url = '?item=Тренажёр'                 where key = 'vibe_trainer'    and prompt_url is null;
update public.course_modules set prompt_url = '?view=young'                    where key = 'prompt_formula'  and prompt_url is null;
update public.course_modules set prompt_url = '?view=lib'                      where key = 'ai_intro'        and prompt_url is null;

notify pgrst, 'reload schema';
