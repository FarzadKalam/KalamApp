-- افزودن اینستاگرام به بخش ارتباطات صفحهٔ عمومیِ منتشرشده.
-- اگر صفحهٔ خانه هنوز از پیکربندی پیش‌فرض استفاده کند، تغییر frontend کافی است؛
-- این migration فقط صفحه‌ای را که در CMS سفارشی و منتشر شده نیز هم‌راستا می‌کند.

begin;

update public.cms_landing_pages as page
set sections = updated_sections.sections
from (
  select source.id,
    jsonb_agg(
      case
        when section.value ->> 'id' = 'communications' then
          jsonb_set(
            section.value,
            '{props,channels}',
            coalesce(section.value #> '{props,channels}', '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object(
                'icon', 'message',
                'title', 'اینستاگرام',
                'text', 'مدیریت دایرکت و کامنت پیج‌های متصل، همراه با پاسخ‌گویی و گردش‌کار خودکار.'
              ))
          )
        else section.value
      end
      order by section.ordinality
    ) as sections
  from public.cms_landing_pages as source
  cross join lateral jsonb_array_elements(source.sections) with ordinality as section(value, ordinality)
  where source.slug = 'home'
    and jsonb_typeof(source.sections) = 'array'
    and exists (
      select 1
      from jsonb_array_elements(source.sections) as communication_section(value)
      where communication_section.value ->> 'id' = 'communications'
    )
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(
        (
          select communication_section.value #> '{props,channels}'
          from jsonb_array_elements(source.sections) as communication_section(value)
          where communication_section.value ->> 'id' = 'communications'
          limit 1
        ),
        '[]'::jsonb
      )) as channel(value)
      where channel.value ->> 'title' = 'اینستاگرام'
    )
  group by source.id
) as updated_sections
where page.id = updated_sections.id;

notify pgrst, 'reload schema';
commit;
