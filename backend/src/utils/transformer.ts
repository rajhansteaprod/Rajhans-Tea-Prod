export function camelToSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => camelToSnakeCase(item));
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      acc[snakeKey] = camelToSnakeCase(obj[key]);
      return acc;
    }, {} as any);
  }
  return obj;
}
