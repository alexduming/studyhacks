'use server';

import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export async function parseDocumentAction(formData: FormData) {
  const file = formData.get('file') as File;
  if (!file) {
    throw new Error('No file provided');
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileType = file.type;
  const fileName = file.name.toLowerCase();

  try {
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const data = await pdf(buffer);
      return { text: data.text };
    } else if (
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      fileName.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value };
    } else if (
      fileType === 'text/plain' || 
      fileType === 'text/markdown' || 
      fileName.endsWith('.txt') || 
      fileName.endsWith('.md')
    ) {
        const text = buffer.toString('utf-8');
        return { text };
    } else {
      throw new Error('Unsupported file type. Please upload PDF, DOCX, TXT, or MD files.');
    }
  } catch (error: any) {
    console.error('Error parsing document:', error);
    throw new Error(error.message || 'Failed to parse document');
  }
}



