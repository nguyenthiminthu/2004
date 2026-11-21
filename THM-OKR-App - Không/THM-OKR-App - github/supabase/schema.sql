-- ============================================================
--  THM OKR – Schema Supabase
--  Chạy toàn bộ file này trong Supabase > SQL Editor (1 lần)
-- ============================================================

-- 1) Phòng ban -------------------------------------------------
create table if not exists public.departments (
  id    text primary key,          -- mã bộ phận: SX, KT, KD...
  name  text not null,
  sort  int  not null default 0
);

insert into public.departments (id, name, sort) values
  ('SX',   'Xưởng sản xuất',        1),
  ('KT',   'Kế toán',               2),
  ('KD',   'Kinh doanh',            3),
  ('HCNS', 'Hành chính nhân sự',    4),
  ('XVC',  'Đội xe vận chuyển',     5),
  ('XVP',  'Đội xe văn phòng',      6),
  ('KVT',  'Kho vật tư',            7),
  ('KTP',  'Kho thành phẩm',        8),
  ('BT',   'Bảo trì',               9),
  ('QC',   'QC',                    10),
  ('NC',   'Nghiên cứu',            11)
on conflict (id) do update set name = excluded.name, sort = excluded.sort;

-- 2) Hồ sơ người dùng (gắn với auth.users) ----------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  role          text not null default 'viewer' check (role in ('admin','head','viewer')),
  department_id text references public.departments(id),
  created_at    timestamptz not null default now()
);
-- Thông tin in trên biểu mẫu Excel
alter table public.profiles add column if not exists employee_code text;   -- Mã nhân viên
alter table public.profiles add column if not exists title         text;   -- Chức danh
alter table public.profiles add column if not exists hr_level      text;   -- Cấp bậc nhân sự
alter table public.profiles add column if not exists staff_group   text;   -- Nhóm CBNV
alter table public.profiles add column if not exists join_date     date;   -- Ngày vào công ty

-- Tự tạo profile khi thêm user mới trong Authentication
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Phiếu OKR: 1 dòng / bộ phận / tháng ------------------------
create table if not exists public.okr_sheets (
  id            uuid primary key default gen_random_uuid(),
  department_id text not null references public.departments(id),
  year          int  not null check (year between 2020 and 2100),
  month         int  not null check (month between 1 and 12),
  objectives    jsonb not null default '[]'::jsonb,  -- [{id,title,weight,krs:[{id,title,unit,target,actual,weight,direction,note}]}]
  comment       text,
  score         numeric(6,2),                         -- điểm % đã tính (0–100)
  status        text not null default 'draft' check (status in ('draft','submitted')),
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now(),
  unique (department_id, year, month)
);
-- Kết quả do Ban giám đốc (QLTT) đánh giá: { "<kr id>": số thực tế }
alter table public.okr_sheets add column if not exists bgd       jsonb not null default '{}'::jsonb;
alter table public.okr_sheets add column if not exists score_bgd numeric(6,2);
create index if not exists okr_sheets_year_idx on public.okr_sheets (year, month);

-- 4) Hàm trợ giúp cho RLS ---------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_dept() returns text
language sql stable security definer set search_path = public as $$
  select department_id from public.profiles where id = auth.uid()
$$;

-- Ban giám đốc + bộ phận được quản lý OKR toàn công ty (mặc định: HCNS)
-- Muốn thêm bộ phận: sửa danh sách array['HCNS'] (và FULL_ACCESS_DEPTS trong js/config.js)
create or replace function public.is_full_access() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' or (role = 'head' and department_id = any (array['HCNS']))
     from public.profiles where id = auth.uid()), false)
$$;

-- Thời điểm cập nhật do máy chủ đặt (dùng để chống ghi đè khi nhiều người sửa cùng lúc)
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists okr_touch on public.okr_sheets;
create trigger okr_touch before insert or update on public.okr_sheets
  for each row execute function public.touch_updated_at();

-- Chỉ Ban giám đốc được ghi cột "QLTT đánh giá"
create or replace function public.protect_bgd() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'admin' then
    if tg_op = 'INSERT' then
      new.bgd := '{}'::jsonb; new.score_bgd := null;
    else
      new.bgd := old.bgd; new.score_bgd := old.score_bgd;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists okr_protect_bgd on public.okr_sheets;
create trigger okr_protect_bgd before insert or update on public.okr_sheets
  for each row execute function public.protect_bgd();

-- 5) Row Level Security -----------------------------------------
alter table public.departments enable row level security;
alter table public.profiles    enable row level security;
alter table public.okr_sheets  enable row level security;

-- Ai đăng nhập cũng được xem (để so sánh giữa các bộ phận)
drop policy if exists dep_read on public.departments;
create policy dep_read on public.departments for select to authenticated using (true);

drop policy if exists prof_read on public.profiles;
create policy prof_read on public.profiles for select to authenticated using (true);

drop policy if exists prof_admin_update on public.profiles;
create policy prof_admin_update on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Xem: BGĐ, HCNS, tài khoản "chỉ xem" thấy tất cả; trưởng bộ phận khác chỉ thấy bộ phận mình
drop policy if exists sheet_read on public.okr_sheets;
create policy sheet_read on public.okr_sheets for select to authenticated
  using (
    public.is_full_access()
    or public.my_role() = 'viewer'
    or department_id = public.my_dept()
  );

-- Sửa: BGĐ + HCNS sửa mọi phiếu (kể cả đã nộp); trưởng bộ phận khác chỉ sửa phiếu nháp của bộ phận mình
drop policy if exists sheet_insert on public.okr_sheets;
create policy sheet_insert on public.okr_sheets for insert to authenticated
  with check (
    public.is_full_access()
    or (public.my_role() = 'head' and department_id = public.my_dept())
  );

drop policy if exists sheet_update on public.okr_sheets;
create policy sheet_update on public.okr_sheets for update to authenticated
  using (
    public.is_full_access()
    or (public.my_role() = 'head' and department_id = public.my_dept() and status = 'draft')
  )
  with check (
    public.is_full_access()
    or (public.my_role() = 'head' and department_id = public.my_dept())
  );

drop policy if exists sheet_delete on public.okr_sheets;
create policy sheet_delete on public.okr_sheets for delete to authenticated
  using (public.my_role() = 'admin');

-- 6) File đính kèm (minh chứng) ---------------------------------
-- Danh sách file của phiếu: [{id,name,size,ext,type,kr_id,path,uploaded_by,uploaded_at}]
-- kr_id = null => tài liệu chung của phiếu
alter table public.okr_sheets add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Kho file riêng tư (không ai xem được nếu không đăng nhập). Tối đa 10 MB/file.
-- Muốn đổi dung lượng: sửa file_size_limit ở đây VÀ ATTACH.MAX_MB trong js/config.js
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('okr-files', 'okr-files', false, 10485760, array[
  'image/jpeg','image/png','image/gif','image/bmp','image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv'
])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Đường dẫn file: <mã bộ phận>/<năm>-<tháng 2 số>/<id>.<đuôi>   ví dụ: QC/2026-11/abc123.jpg
-- Phiếu tháng đó đã nộp chưa? (trưởng bộ phận không được thêm/xoá file khi phiếu đã nộp)
create or replace function public.okr_sheet_locked(dep text, ym text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.okr_sheets
    where department_id = dep and status = 'submitted'
      and ym = year::text || '-' || lpad(month::text, 2, '0'))
$$;

-- Xem/tải file: giống quyền xem phiếu
drop policy if exists okr_files_read on storage.objects;
create policy okr_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'okr-files' and (
      public.is_full_access()
      or public.my_role() = 'viewer'
      or (storage.foldername(name))[1] = public.my_dept()
    )
  );

-- Tải lên: BGĐ + HCNS mọi bộ phận; trưởng bộ phận chỉ bộ phận mình và khi phiếu chưa nộp
drop policy if exists okr_files_insert on storage.objects;
create policy okr_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'okr-files' and (
      public.is_full_access()
      or (public.my_role() = 'head'
          and (storage.foldername(name))[1] = public.my_dept()
          and not public.okr_sheet_locked((storage.foldername(name))[1], (storage.foldername(name))[2]))
    )
  );

-- Xoá file: cùng điều kiện với tải lên
drop policy if exists okr_files_delete on storage.objects;
create policy okr_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'okr-files' and (
      public.is_full_access()
      or (public.my_role() = 'head'
          and (storage.foldername(name))[1] = public.my_dept()
          and not public.okr_sheet_locked((storage.foldername(name))[1], (storage.foldername(name))[2]))
    )
  );

-- ============================================================
-- SAU KHI CHẠY XONG:
-- 1. Authentication > Users > Add user: tạo tài khoản cho Ban giám đốc
--    và 11 trưởng bộ phận (email + mật khẩu, tick "Auto confirm").
-- 2. Đặt quyền admin cho tài khoản Ban giám đốc:
--    update public.profiles set role = 'admin', full_name = 'Ban giám đốc'
--    where email = 'admin@sonthehemoi.vn';
-- 3. Đăng nhập app bằng tài khoản admin > mục "Tài khoản" để gán
--    bộ phận + vai trò "Trưởng bộ phận" cho từng người.
--    (hoặc dùng SQL:)
--    update public.profiles set role='head', department_id='SX' where email='xuong@sonthehemoi.vn';
-- ============================================================
