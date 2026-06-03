/**
 * Smart CSV Parser with intelligent column detection and flexible format handling
 */

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
  delimiter: string;
  rowCount: number;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number;
  samples: string[];
}

export interface SmartColumnMap {
  employee?: ColumnMapping;
  firstName?: ColumnMapping;
  lastName?: ColumnMapping;
  date?: ColumnMapping;
  workOrder?: ColumnMapping;
  hours?: ColumnMapping;
  clockIn?: ColumnMapping;
  clockOut?: ColumnMapping;
  breakMinutes?: ColumnMapping;
  notes?: ColumnMapping;
  unmapped: string[];
}

export interface ContactColumnMap {
  first_name?: ColumnMapping;
  last_name?: ColumnMapping;
  company_name?: ColumnMapping;
  email?: ColumnMapping;
  phone?: ColumnMapping;
  business_phone?: ColumnMapping;
  mobile_phone?: ColumnMapping;
  street_address?: ColumnMapping;
  city?: ColumnMapping;
  state?: ColumnMapping;
  zip_code?: ColumnMapping;
  country?: ColumnMapping;
  contact_type?: ColumnMapping;
  title?: ColumnMapping;
  notes?: ColumnMapping;
  temperature?: ColumnMapping;
  payment_terms?: ColumnMapping;
  credit_limit?: ColumnMapping;
  unmapped: string[];
}

/**
 * Detect the delimiter used in the CSV
 */
function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0];
  const delimiters = [',', ';', '\t', '|'];

  let maxCount = 0;
  let detectedDelimiter = ',';

  for (const delimiter of delimiters) {
    const count = (firstLine.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      detectedDelimiter = delimiter;
    }
  }

  return detectedDelimiter;
}

/**
 * Remove BOM (Byte Order Mark) if present
 */
function removeBOM(text: string): string {
  if (text.charCodeAt(0) === 0xFEFF) {
    return text.slice(1);
  }
  return text;
}

/**
 * Parse a CSV line properly handling quoted fields
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last field
  result.push(current.trim());

  return result;
}

/**
 * Parse CSV text into structured data
 */
export function parseCSV(text: string): ParsedCSV {
  // Remove BOM and normalize line endings
  text = removeBOM(text);
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Detect delimiter
  const delimiter = detectDelimiter(text);

  // Split into lines
  const lines = text.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Parse headers
  const headers = parseCSVLine(lines[0], delimiter);

  // Parse data rows
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i], delimiter);
    // Only include rows that have at least one non-empty value
    if (row.some(cell => cell.length > 0)) {
      // Pad row to match header length
      while (row.length < headers.length) {
        row.push('');
      }
      rows.push(row);
    }
  }

  return {
    headers,
    rows,
    delimiter,
    rowCount: rows.length
  };
}

/**
 * Calculate similarity between two strings (0-1)
 */
function stringSimilarity(str1: string, str2: string): number {
  str1 = str1.toLowerCase();
  str2 = str2.toLowerCase();

  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  // Check if one contains the other
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.8;
  }

  // Calculate Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const maxLength = Math.max(str1.length, str2.length);
  return 1 - matrix[str2.length][str1.length] / maxLength;
}

/**
 * Match a column header to a field using keywords and fuzzy matching
 */
function matchColumn(header: string, keywords: string[]): number {
  const headerLower = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  let maxScore = 0;

  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Exact match
    if (headerLower === keywordLower) {
      return 1.0;
    }

    // Contains match
    if (headerLower.includes(keywordLower) || keywordLower.includes(headerLower)) {
      maxScore = Math.max(maxScore, 0.9);
    }

    // Fuzzy match
    const similarity = stringSimilarity(headerLower, keywordLower);
    if (similarity > 0.7) {
      maxScore = Math.max(maxScore, similarity * 0.85);
    }
  }

  return maxScore;
}

/**
 * Convert raw CSV rows to objects keyed by header names
 */
export function rowsToObjects(parsed: ParsedCSV): Record<string, string>[] {
  return parsed.rows.map(row => {
    const obj: Record<string, string> = {};
    parsed.headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj;
  });
}

/**
 * Intelligently map CSV columns to expected fields
 */
export function detectColumnMapping(parsed: ParsedCSV, importType: 'job_time' | 'daily_time' = 'job_time'): SmartColumnMap {
  const mapping: SmartColumnMap = {
    unmapped: []
  };

  const fieldKeywords: Record<string, string[]> = {
    employee: [
      'employee', 'worker', 'tech', 'technician', 'staff', 'person',
      'full name', 'user', 'username', 'fullname', 'emp', 'techname',
      'tech name', 'employee name', 'worker name', 'staff name', 'full_name'
    ],
    firstName: [
      'first name', 'firstname', 'first', 'given name', 'givenname', 'fname',
      'first_name', 'forename', 'employee first', 'tech first'
    ],
    lastName: [
      'last name', 'lastname', 'last', 'surname', 'family name', 'familyname',
      'lname', 'last_name', 'employee last', 'tech last'
    ],
    date: [
      'date', 'day', 'work date', 'entry date', 'shift date', 'timesheet date',
      'workdate', 'entrydate', 'shiftdate', 'timesheetdate', 'dt', 'workday'
    ],
    workOrder: [
      'work order', 'workorder', 'wo', 'job', 'job number', 'jobnumber',
      'ticket', 'service call', 'servicecall', 'work order number',
      'workordernumber', 'wo number', 'wonumber', 'job no', 'jobno',
      'wo#', 'job#', 'ticket#', 'order', 'order number'
    ],
    hours: [
      'hours', 'hrs', 'total hours', 'totalhours', 'time', 'duration',
      'worked hours', 'workedhours', 'hour', 'total time', 'totaltime'
    ],
    clockIn: [
      'clock in', 'clockin', 'start', 'start time', 'starttime', 'begin',
      'in', 'punch in', 'punchin', 'time in', 'timein', 'arrival',
      'check in', 'checkin', 'clock_in', 'start_time'
    ],
    clockOut: [
      'clock out', 'clockout', 'end', 'end time', 'endtime', 'finish',
      'out', 'punch out', 'punchout', 'time out', 'timeout', 'departure',
      'check out', 'checkout', 'clock_out', 'end_time'
    ],
    breakMinutes: [
      'break', 'breaks', 'break time', 'breaktime', 'break minutes',
      'breakminutes', 'lunch', 'lunch break', 'break_minutes', 'break_time'
    ],
    notes: [
      'notes', 'note', 'comments', 'comment', 'description', 'memo',
      'remarks', 'details', 'info', 'information'
    ]
  };

  // Skip workOrder field for daily_time imports
  if (importType === 'daily_time') {
    delete fieldKeywords.workOrder;
  }

  const usedHeaders = new Set<string>();

  // Find best match for each field
  for (const [field, keywords] of Object.entries(fieldKeywords)) {
    let bestMatch: { header: string; score: number; index: number } | null = null;

    parsed.headers.forEach((header, index) => {
      if (usedHeaders.has(header)) return;

      const score = matchColumn(header, keywords);
      if (score > 0.6 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { header, score, index };
      }
    });

    if (bestMatch) {
      usedHeaders.add(bestMatch.header);

      // Get sample values from first 3 rows
      const samples = parsed.rows
        .slice(0, 3)
        .map(row => row[bestMatch!.index])
        .filter(val => val);

      (mapping as any)[field] = {
        sourceColumn: bestMatch.header,
        targetField: field,
        confidence: bestMatch.score,
        samples
      };
    }
  }

  // Track unmapped columns
  mapping.unmapped = parsed.headers.filter(h => !usedHeaders.has(h));

  return mapping;
}

/**
 * Validate that required fields are mapped.
 * Work order is optional — rows without a matched work order will import without one.
 */
export function validateMapping(mapping: SmartColumnMap, importType: 'job_time' | 'daily_time' = 'job_time'): { isValid: boolean; valid: boolean; errors: string[]; missing: string[] } {
  const errors: string[] = [];
  const missing: string[] = [];

  // Employee name: accept full employee column OR both firstName + lastName
  const hasEmployee = !!mapping.employee;
  const hasFirstName = !!mapping.firstName;
  const hasLastName = !!mapping.lastName;
  const hasNameMapping = hasEmployee || (hasFirstName && hasLastName) || hasLastName;

  if (!hasNameMapping) {
    errors.push('Missing employee name mapping — map "Employee" column, or map both "First Name" and "Last Name" columns');
    missing.push('employee name');
  }

  if (!mapping.date) {
    errors.push('Missing required field: date');
    missing.push('date');
  }

  // Need either hours OR clockIn (clockOut is optional for ongoing shifts)
  const hasHours = !!mapping.hours;
  const hasClockIn = !!mapping.clockIn;

  if (!hasHours && !hasClockIn) {
    errors.push('Must have either hours field OR clock in time');
    missing.push('hours or clockIn');
  }

  return {
    isValid: errors.length === 0,
    valid: errors.length === 0,
    errors,
    missing
  };
}

/**
 * Try to extract just a date portion (YYYY-MM-DD or M/D/YYYY) from a cell
 * that might contain "M/D/YYYY H:MM AM" or "YYYY-MM-DD HH:MM:SS" etc.
 */
export function extractDatePart(value: string): string {
  if (!value) return '';
  value = value.trim();

  // Already a plain date (no time component)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) return value;

  // ISO-like: 2024-02-10T08:00:00 or 2024-02-10 08:00:00
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoMatch) return isoMatch[1];

  // M/D/YYYY H:MM or M/D/YYYY HH:MM AM/PM
  const mdyMatch = value.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s/);
  if (mdyMatch) return mdyMatch[1];

  // Date-only fallback: try parsing and formatting
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return value;
}

/**
 * Try to extract just a time portion (HH:MM or HH:MM:SS) from a cell
 * that might contain "M/D/YYYY H:MM AM" or "YYYY-MM-DD HH:MM:SS" etc.
 */
export function extractTimePart(value: string): string {
  if (!value) return '';
  value = value.trim();

  // Already a plain time HH:MM or HH:MM:SS (24h)
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) return value.substring(0, 5);

  // ISO-like: contains T or space followed by time
  const isoMatch = value.match(/[T\s](\d{2}:\d{2})(:\d{2})?/);
  if (isoMatch) return isoMatch[1];

  // M/D/YYYY H:MM AM/PM
  const ampmMatch = value.match(/\s(\d{1,2}:\d{2})\s?(AM|PM)/i);
  if (ampmMatch) {
    const [, timePart, meridiem] = ampmMatch;
    const [hStr, mStr] = timePart.split(':');
    let hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    if (meridiem.toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (meridiem.toUpperCase() === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // Plain time anywhere in string
  const timeMatch = value.match(/\b(\d{1,2}:\d{2})\b/);
  if (timeMatch) return timeMatch[1].padStart(5, '0');

  return '';
}

/**
 * Intelligently map CSV columns to contact fields
 */
export function detectContactColumnMapping(parsed: ParsedCSV): ContactColumnMap {
  const mapping: ContactColumnMap = { unmapped: [] };

  const fieldKeywords: Record<keyof Omit<ContactColumnMap, 'unmapped'>, string[]> = {
    first_name: [
      'first name', 'firstname', 'first', 'given name', 'givenname', 'fname',
      'first_name', 'forename', 'contact first', 'customer first'
    ],
    last_name: [
      'last name', 'lastname', 'last', 'surname', 'family name', 'familyname',
      'lname', 'last_name', 'contact last', 'customer last'
    ],
    company_name: [
      'company', 'company name', 'companyname', 'business', 'business name',
      'businessname', 'organization', 'org', 'firm', 'employer', 'account',
      'account name', 'accountname', 'company_name'
    ],
    email: [
      'email', 'email address', 'emailaddress', 'e-mail', 'e_mail', 'mail',
      'electronic mail', 'contact email', 'customer email', 'email_address'
    ],
    phone: [
      'phone', 'phone number', 'phonenumber', 'telephone', 'tel', 'phone_number',
      'home phone', 'homephone', 'main phone', 'mainphone', 'primary phone',
      'contact phone', 'customer phone', 'number', 'ph', 'ph #'
    ],
    business_phone: [
      'business phone', 'businessphone', 'office phone', 'officephone', 'work phone',
      'workphone', 'business_phone', 'office_phone', 'work_phone', 'biz phone',
      'direct', 'direct dial', 'direct phone', 'daytime phone'
    ],
    mobile_phone: [
      'mobile', 'mobile phone', 'mobilephone', 'cell', 'cell phone', 'cellphone',
      'mobile_phone', 'cell_phone', 'cellular', 'wireless', 'smartphone',
      'mobile number', 'cell number', 'sms'
    ],
    street_address: [
      'address', 'street', 'street address', 'streetaddress', 'address1', 'address 1',
      'address line 1', 'street_address', 'addr', 'street1', 'mailing address',
      'billing address', 'home address', 'line 1', 'addr1'
    ],
    city: [
      'city', 'town', 'municipality', 'city name', 'cityname', 'locality',
      'city/town', 'city_name'
    ],
    state: [
      'state', 'province', 'region', 'state/province', 'st', 'state code',
      'statecode', 'state_code', 'state name', 'prov', 'territory'
    ],
    zip_code: [
      'zip', 'zip code', 'zipcode', 'postal code', 'postalcode', 'postal',
      'zip_code', 'post code', 'postcode', 'zip/postal', 'postal_code'
    ],
    country: [
      'country', 'country name', 'countryname', 'nation', 'country code',
      'countrycode', 'country_code', 'country_name'
    ],
    contact_type: [
      'type', 'contact type', 'contacttype', 'customer type', 'customertype',
      'contact_type', 'client type', 'account type', 'category'
    ],
    title: [
      'title', 'job title', 'jobtitle', 'position', 'role', 'designation',
      'job_title', 'occupation', 'salutation', 'prefix', 'mr', 'mrs', 'dr'
    ],
    notes: [
      'notes', 'note', 'comments', 'comment', 'description', 'memo',
      'remarks', 'details', 'info', 'information', 'additional info',
      'special notes', 'customer notes'
    ],
    temperature: [
      'temperature', 'lead temp', 'lead_temp', 'status', 'hot', 'warm', 'cold',
      'lead status', 'prospect status', 'interest level', 'priority level'
    ],
    payment_terms: [
      'payment terms', 'paymentterms', 'terms', 'payment_terms', 'net terms',
      'billing terms', 'credit terms', 'pay terms', 'pay_terms'
    ],
    credit_limit: [
      'credit limit', 'creditlimit', 'credit_limit', 'credit', 'credit amount',
      'spending limit', 'account limit', 'credit cap'
    ]
  };

  const usedHeaders = new Set<string>();

  const looksLikeEmail = (values: string[]): boolean => {
    const nonEmpty = values.filter(Boolean);
    if (nonEmpty.length === 0) return false;
    const emailCount = nonEmpty.filter(v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())).length;
    return emailCount / nonEmpty.length >= 0.5;
  };

  const looksLikePhone = (values: string[]): boolean => {
    const nonEmpty = values.filter(Boolean);
    if (nonEmpty.length === 0) return false;
    const phoneCount = nonEmpty.filter(v => /^[\d\s\-().+]{7,}$/.test(v.trim()) && v.replace(/\D/g, '').length >= 7).length;
    return phoneCount / nonEmpty.length >= 0.5;
  };

  const getSamples = (index: number): string[] =>
    parsed.rows.slice(0, 10).map(row => row[index] || '').filter(Boolean);

  for (const [field, keywords] of Object.entries(fieldKeywords) as [keyof Omit<ContactColumnMap, 'unmapped'>, string[]][]) {
    let bestMatch: { header: string; score: number; index: number } | null = null;

    parsed.headers.forEach((header, index) => {
      if (usedHeaders.has(header)) return;
      let score = matchColumn(header, keywords);
      if (score <= 0.6) return;

      const samples = getSamples(index);
      if (field === 'email') {
        if (looksLikePhone(samples)) score *= 0.3;
        else if (looksLikeEmail(samples)) score = Math.min(score * 1.2, 1.0);
      }
      if (['phone', 'business_phone', 'mobile_phone'].includes(field)) {
        if (looksLikeEmail(samples)) score *= 0.3;
        else if (looksLikePhone(samples)) score = Math.min(score * 1.2, 1.0);
      }

      if (score > 0.6 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { header, score, index };
      }
    });

    if (bestMatch) {
      usedHeaders.add((bestMatch as { header: string; score: number; index: number }).header);
      const samples = getSamples((bestMatch as { header: string; score: number; index: number }).index).slice(0, 3);

      mapping[field] = {
        sourceColumn: (bestMatch as { header: string; score: number; index: number }).header,
        targetField: field,
        confidence: (bestMatch as { header: string; score: number; index: number }).score,
        samples
      };
    }
  }

  mapping.unmapped = parsed.headers.filter(h => !usedHeaders.has(h));
  return mapping;
}

/**
 * Apply contact column mapping to transform raw rows into contact objects
 */
export function applyContactMapping(
  rows: Record<string, string>[],
  mapping: ContactColumnMap
): Record<string, string>[] {
  return rows.map(row => {
    const obj: Record<string, string> = {};
    for (const [field, columnMapping] of Object.entries(mapping)) {
      if (field === 'unmapped' || !columnMapping) continue;
      const cm = columnMapping as ColumnMapping;
      const value = row[cm.sourceColumn];
      if (value !== undefined) {
        obj[field] = value;
      }
    }
    return obj;
  });
}

/**
 * Convert a ParsedCSV (or pre-built row objects) using the mapping.
 * Accepts either ParsedCSV or Record<string,string>[] for backwards compatibility.
 * Applies date/time extraction so the same source column can be mapped to
 * both "date" and "clockIn"/"clockOut" fields.
 */
export function applyMapping(source: ParsedCSV | Record<string, string>[], mapping: SmartColumnMap): Record<string, string>[] {
  // Normalise to array of header-keyed objects
  let rows: Record<string, string>[];
  if (Array.isArray(source)) {
    rows = source;
  } else {
    rows = rowsToObjects(source);
  }

  // camelCase field → output key
  const fieldNameMap: Record<string, string> = {
    employee: 'employee',
    firstName: 'firstName',
    lastName: 'lastName',
    clockIn: 'clockIn',
    clockOut: 'clockOut',
    breakMinutes: 'breakMinutes',
    workOrder: 'workOrder',
    date: 'date',
    hours: 'hours',
    notes: 'notes'
  };

  // Fields that need date extraction from a potentially combined cell
  const dateFields = new Set(['date']);
  // Fields that need time extraction from a potentially combined cell
  const timeFields = new Set(['clockIn', 'clockOut']);

  return rows.map(row => {
    const obj: Record<string, string> = {};

    for (const [field, columnMapping] of Object.entries(mapping)) {
      if (field === 'unmapped' || !columnMapping) continue;

      const cm = columnMapping as ColumnMapping;
      const rawValue = row[cm.sourceColumn] ?? '';

      const outputField = fieldNameMap[field] || field;

      if (dateFields.has(field)) {
        obj[outputField] = extractDatePart(rawValue);
      } else if (timeFields.has(field)) {
        obj[outputField] = extractTimePart(rawValue);
      } else {
        obj[outputField] = rawValue;
      }
    }

    // Combine firstName + lastName into employee if no standalone employee column
    if (!obj.employee) {
      const first = obj.firstName?.trim() || '';
      const last = obj.lastName?.trim() || '';
      if (first || last) {
        obj.employee = [first, last].filter(Boolean).join(' ');
      }
    }

    return obj;
  });
}
