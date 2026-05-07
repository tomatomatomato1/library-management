const API_BASE = '/api';

export async function fetchAllConfigs() {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) throw new Error('获取配置失败');
  return res.json();
}

export async function updateConfig(key, value, type, description) {
  const res = await fetch(`${API_BASE}/config/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: String(value), type, description }),
  });
  if (!res.ok) throw new Error(`更新 ${key} 失败`);
  return res.json();
}