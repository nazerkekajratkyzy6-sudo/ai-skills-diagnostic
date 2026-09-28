export type Role = 'super_admin' | 'school_admin'

export interface Profile {
  id: string; role: Role; school_id: string | null; full_name: string | null; login: string | null; is_active: boolean
}
export interface School {
  id: string; name: string; region: string | null; city: string | null; code: string
  status: 'active' | 'inactive'; diagnostic_open: boolean; is_demo: boolean; created_at: string
}
export interface Campaign {
  id: string; code: string; name_kk: string; name_ru: string; topic_kk: string; topic_ru: string
  status: 'draft' | 'published' | 'closed'; all_schools: boolean; is_demo: boolean
  g2_min_percent: number; g2_min_completed: number; g3_min_percent: number; g3_min_level2: number; g3_min_vibe: number
  require_prompt_for_level2: boolean; min_prompt_length: number; min_text_length: number
  product_choice: boolean; platform_survey: boolean; allow_files: boolean; max_files: number; platform_options: string[]
  created_at: string; published_at: string | null
}
export interface Task {
  id: string; campaign_id: string; key: string; kind: 'standard' | 'vibe'; position: number; enabled: boolean
  title_kk: string; title_ru: string; instruction_kk: string; instruction_ru: string; tool_options: string[]
  allow_text: boolean; prompt_mode: 'none' | 'optional' | 'required'; process_kk: string[]; process_ru: string[]
  extra_type: 'none' | 'multi' | 'single'; extra_question_kk: string | null; extra_question_ru: string | null
  extra_options_kk: string[]; extra_options_ru: string[]
}
export interface Participant {
  id: string; school_id: string; full_name: string; position: string | null; personal_code: string; is_demo: boolean; created_at: string
}
export interface Answer {
  id: string; submission_id: string; task_id: string | null; task_key: string; process_level: number
  auto_score: number; score: number; tools: string[]; other_tool: string | null; link: string | null
  result_text: string | null; prompt_text: string | null; extra_answer: number[]; time_seconds: number | null
  files?: EvidenceFile[]
}
export interface EvidenceFile { path: string; name: string; size: number; type: string }
export interface Submission {
  id: string; participant_id: string; school_id: string; campaign_id: string; full_name: string; position: string | null
  language: 'kk' | 'ru'; started_at: string | null; finished_at: string; duration_seconds: number | null
  total_score: number; max_score: number; percent: number; group_no: 1 | 2 | 3; tools_used: string[]
  tools_count: number; vibe_self: number | null; result_token: string; reviewed: boolean; is_demo: boolean
  chosen_task?: string | null; platforms?: Record<string, number>; platforms_other?: string | null
  schools?: { name: string; region: string | null } | null
  campaigns?: { name_kk: string; name_ru: string } | null
  answers?: Answer[]
}
export interface Filters {
  school_id?: string; region?: string; campaign_id?: string; group_no?: string; language?: string
  date_from?: string; date_to?: string; include_demo?: boolean
}
