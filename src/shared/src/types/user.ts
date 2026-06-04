/**
 * User and academic subject types
 */

export interface User {
  id: string;
  type: 'ADMIN' | 'PROFESSOR' | 'STUDENT';
  firstName: string;
  lastName: string;
  email?: string;
  cedula: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  credits: number;
}
