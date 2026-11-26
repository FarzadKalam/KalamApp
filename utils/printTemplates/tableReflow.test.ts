import { describe, expect, it } from 'vitest';
import { applyPrintFieldVisibilityAndReflow } from './tableReflow';
import { buildListTableHtml } from '../listPrintExport';

describe('applyPrintFieldVisibilityAndReflow', () => {
  it('removes turned-off paired cells, reflows subsequent pairs, and gives colspan to an odd trailing pair', () => {
    const html = `
      <div>
        <h3>مشخصات کارمند</h3>
        <table>
          <tbody>
            <tr>
              <td>کارمند</td><td>{{record.employee_id}}</td>
              <td>سمت</td><td>{{record.employee_job_title}}</td>
            </tr>
            <tr>
              <td>کد ملی</td><td>{{record.employee_national_code}}</td>
              <td>نام پدر</td><td>{{record.employee_father_name}}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    const result = applyPrintFieldVisibilityAndReflow(html, {
      isFieldVisible: (path) => path !== 'record.employee_job_title',
    });

    const doc = new DOMParser().parseFromString(result, 'text/html');
    const rows = Array.from(doc.querySelectorAll('tr'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).not.toContain('سمت');
    // Pair shifted up from row 2 into row 1
    expect(rows[0].cells[2].textContent).toBe('کد ملی');
    expect(rows[0].cells[3].textContent).toBe('{{record.employee_national_code}}');
    // Odd trailing pair gets colspan="3"
    expect(rows[1].cells).toHaveLength(2);
    expect(rows[1].cells[0].textContent).toBe('نام پدر');
    expect(rows[1].cells[1].getAttribute('colspan')).toBe('3');
  });

  it('reflows self-contained multi-column info grids cleanly', () => {
    const html = `
      <table>
        <tbody>
          <tr>
            <td>نام: {{record.name}}</td>
            <td>کد: {{record.system_code}}</td>
          </tr>
          <tr>
            <td>تلفن: {{record.mobile}}</td>
            <td>شهر: {{record.city}}</td>
          </tr>
        </tbody>
      </table>
    `;

    const result = applyPrintFieldVisibilityAndReflow(html, {
      isFieldVisible: (path) => path !== 'record.system_code',
    });

    const doc = new DOMParser().parseFromString(result, 'text/html');
    const rows = Array.from(doc.querySelectorAll('tr'));
    expect(rows).toHaveLength(2);
    expect(rows[0].cells).toHaveLength(2);
    expect(rows[0].cells[1].textContent).toContain('تلفن');
    expect(rows[1].cells).toHaveLength(1);
    expect(rows[1].cells[0].getAttribute('colspan')).toBe('2');
  });

  it('removes the entire table and its heading when all fields in the table are turned off', () => {
    const html = `
      <div>
        <h3>اطلاعات تکمیلی</h3>
        <table>
          <tbody>
            <tr>
              <td>کد ملی</td><td>{{record.national_code}}</td>
              <td>شماره بیمه</td><td>{{record.insurance_number}}</td>
            </tr>
          </tbody>
        </table>
        <div>بخش بعدی</div>
      </div>
    `;

    const result = applyPrintFieldVisibilityAndReflow(html, {
      isFieldVisible: () => false,
    });

    const doc = new DOMParser().parseFromString(result, 'text/html');
    expect(doc.querySelector('h3')).toBeNull();
    expect(doc.querySelector('table')).toBeNull();
    expect(doc.body.textContent).toContain('بخش بعدی');
  });

  it('protects internal block tables, preserve-rows tables, and nested layout tables from reflow', () => {
    const html = `
      <table data-print-block="invoiceItems">
        <thead><tr><th>شرح</th><th>تخفیف</th></tr></thead>
        <tbody><tr><td>{{row.product_id}}</td><td>{{row.discount}}</td></tr></tbody>
      </table>
      <table data-print-preserve-rows="true">
        <tbody><tr><td>تخفیف</td><td>{{record.total_discount}}</td></tr></tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <td><table><tbody><tr><td>تو در تو</td><td>{{record.nested}}</td></tr></tbody></table></td>
          </tr>
        </tbody>
      </table>
    `;

    const result = applyPrintFieldVisibilityAndReflow(html, {
      isFieldVisible: (path) => path === 'row.product_id',
    });

    const doc = new DOMParser().parseFromString(result, 'text/html');
    // data-print-block, data-print-preserve-rows, and nested outer wrapper tables stay intact
    expect(doc.querySelectorAll('table[data-print-block="invoiceItems"]')).toHaveLength(1);
    expect(doc.querySelectorAll('table[data-print-preserve-rows="true"]')).toHaveLength(1);
    expect(doc.body.innerHTML).toContain('{{row.discount}}');
  });

  it('keeps explicitly enabled fields visible even when their record value is empty at render time', () => {
    const html = `
      <table>
        <tbody>
          <tr><td>توضیحات</td><td>{{record.notes}}</td></tr>
        </tbody>
      </table>
    `;

    const result = applyPrintFieldVisibilityAndReflow(html, {
      isFieldVisible: () => true,
    });

    expect(result).toContain('توضیحات');
    expect(result).toContain('{{record.notes}}');
  });

  it('omits list print table completely when zero columns are selected', () => {
    expect(buildListTableHtml([], [{ id: '1', name: 'تست' }], {}, 'تومان')).toBe('');
  });

  it('hides optional logo image without removing sibling company name content in header cell', () => {
    const html = `
      <table>
        <tbody>
          <tr>
            <td>
              <img data-print-optional-field="company.logo_url" src="{{company.logo_url}}" alt="لوگو" />
              <div>{{company.company_full_name}}</div>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const result = applyPrintFieldVisibilityAndReflow(html, {
      isFieldVisible: (path) => path !== 'company.logo_url',
    });

    expect(result).not.toContain('<img');
    expect(result).not.toContain('company.logo_url');
    expect(result).toContain('{{company.company_full_name}}');
  });

  it('removes optional bordered notes wrapper and its heading when notes field is hidden', () => {
    const html = `
      <div>
        <div data-print-optional-field="record.notes" style="border:1px solid #d1d5db; padding:8px;">
          <div>یادداشت‌ها</div>
          <div>{{record.notes}}</div>
        </div>
        <div data-print-optional-field="record.body">{{record.body}}</div>
      </div>
    `;

    const result = applyPrintFieldVisibilityAndReflow(html, {
      isFieldVisible: (path) => path === 'record.body',
    });

    expect(result).not.toContain('یادداشت‌ها');
    expect(result).not.toContain('{{record.notes}}');
    expect(result).toContain('{{record.body}}');
  });
});
