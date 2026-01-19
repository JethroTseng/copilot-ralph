export const detectPromise = (text: string, promisePhrase: string): boolean => {
  if (!promisePhrase) {
    return false;
  }

  const wrapped = `<promise>${promisePhrase}</promise>`;
  return text.includes(wrapped);
};
