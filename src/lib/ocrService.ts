import Tesseract from 'tesseract.js';

export interface OCRResult {
  firstName: string;
  lastName: string;
  title: string;
  companyName: string;
  email: string;
  phone: string;
  confidence: number;
  fieldConfidence: {
    firstName: number;
    lastName: number;
    title: number;
    companyName: number;
    email: number;
    phone: number;
  };
}

function preprocessImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const enhanced = avg < 128 ? avg * 0.5 : avg * 1.5;
        data[i] = data[i + 1] = data[i + 2] = Math.min(255, enhanced);
      }

      ctx.putImageData(imageData, 0, 0);

      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };

    img.onerror = () => reject(new Error('Could not load image'));
    img.src = URL.createObjectURL(file);
  });
}

function extractEmail(lines: string[]): { value: string; confidence: number } {
  for (const line of lines) {
    const emailMatch = line.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
    if (emailMatch) {
      return { value: emailMatch[1].toLowerCase(), confidence: 95 };
    }
  }
  return { value: '', confidence: 0 };
}

function extractPhone(lines: string[]): { value: string; confidence: number } {
  for (const line of lines) {
    const phoneMatch = line.match(/(\+?1?\s*\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/);
    if (phoneMatch) {
      const cleaned = phoneMatch[1].replace(/[^\d+]/g, '');
      return { value: cleaned, confidence: 90 };
    }

    if (line.match(/^\+?[\d\s()-]{10,}$/)) {
      const cleaned = line.replace(/[^\d+]/g, '');
      if (cleaned.length >= 10) {
        return { value: cleaned, confidence: 75 };
      }
    }
  }
  return { value: '', confidence: 0 };
}

function extractTitle(lines: string[]): { value: string; confidence: number } {
  const titleKeywords = [
    'president', 'ceo', 'cto', 'cfo', 'coo', 'director', 'manager', 'executive',
    'owner', 'founder', 'chief', 'head', 'lead', 'senior', 'junior', 'associate',
    'coordinator', 'specialist', 'analyst', 'engineer', 'developer', 'designer',
    'consultant', 'advisor', 'partner', 'vice president', 'vp'
  ];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    for (const keyword of titleKeywords) {
      if (lowerLine.includes(keyword) && line.length < 50) {
        return { value: line.trim(), confidence: 85 };
      }
    }

    if (line.length >= 3 && line.length <= 40 && /^[A-Z][a-z]/.test(line)) {
      const words = line.split(/\s+/);
      if (words.length >= 2 && words.length <= 5) {
        return { value: line.trim(), confidence: 70 };
      }
    }
  }
  return { value: '', confidence: 0 };
}

function extractCompany(lines: string[], titleIndex: number): { value: string; confidence: number } {
  const companyIndicators = ['inc', 'llc', 'ltd', 'corp', 'company', 'co.', 'group', 'partners', 'industries', 'solutions'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    for (const indicator of companyIndicators) {
      if (lowerLine.includes(indicator)) {
        return { value: line.trim(), confidence: 90 };
      }
    }

    if (titleIndex >= 0 && i === titleIndex + 1 && line.length >= 3 && line.length <= 50) {
      return { value: line.trim(), confidence: 75 };
    }
  }

  const capitalizedLines = lines.filter(line =>
    line.length >= 3 && line.length <= 50 && /^[A-Z]/.test(line)
  );

  if (capitalizedLines.length > 0) {
    return { value: capitalizedLines[0].trim(), confidence: 60 };
  }

  return { value: '', confidence: 0 };
}

function extractName(lines: string[]): { firstName: string; lastName: string; confidence: number } {
  const namePattern = /^[A-Z][a-z]+ [A-Z][a-z]+$/;

  for (const line of lines) {
    if (namePattern.test(line.trim())) {
      const parts = line.trim().split(/\s+/);
      if (parts.length === 2) {
        return {
          firstName: parts[0],
          lastName: parts[1],
          confidence: 85
        };
      }
    }
  }

  const words = lines
    .join(' ')
    .split(/\s+/)
    .filter(word => word.length >= 2 && /^[A-Z][a-z]+$/.test(word));

  if (words.length >= 2) {
    return {
      firstName: words[0],
      lastName: words[words.length - 1],
      confidence: 65
    };
  }

  return { firstName: '', lastName: '', confidence: 0 };
}

export async function processBusinessCard(imageFile: File): Promise<OCRResult> {
  try {
    const preprocessedImage = await preprocessImage(imageFile);

    const { data: { text, confidence } } = await Tesseract.recognize(
      preprocessedImage,
      'eng',
      {
        logger: () => {},
      }
    );

    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const email = extractEmail(lines);
    const phone = extractPhone(lines);
    const title = extractTitle(lines);

    const titleIndex = title.value ? lines.findIndex(line => line.includes(title.value)) : -1;
    const company = extractCompany(lines, titleIndex);

    const name = extractName(lines);

    return {
      firstName: name.firstName,
      lastName: name.lastName,
      title: title.value,
      companyName: company.value,
      email: email.value,
      phone: phone.value,
      confidence: confidence || 0,
      fieldConfidence: {
        firstName: name.confidence,
        lastName: name.confidence,
        title: title.confidence,
        companyName: company.confidence,
        email: email.confidence,
        phone: phone.confidence,
      },
    };
  } catch (error) {
    console.error('OCR processing error:', error);
    throw new Error('Failed to process business card image');
  }
}
