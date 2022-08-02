export {};

export class DomainError extends Error {
 constructor(public code: string, message: string, public status = 400) { super(message); this.name = 'DomainError'; }
}
export function identifier(value: unknown, field: string): string {
 if (typeof value !== 'string' || value.length > 64 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value))
  throw new DomainError('invalid_identifier', `${field} must be a canonical identifier`);
 return value;
}
