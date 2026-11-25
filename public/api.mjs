export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401 && !path.endsWith('/login')) {
    window.location.assign('/login.html');
    throw new Error('登录已失效，请重新登录。');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || `请求失败（${response.status}）`);
    error.status = response.status;
    error.code = data.error?.code;
    throw error;
  }
  return data;
}
