import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { Check, AlertCircle, Settings } from 'lucide-react';

const CONFIG_DEFINITIONS = [
  { key: 'FINE_RATE_PER_DAY', label: '逾期日罚款（元/天）', type: 'float', defaultValue: 0.5, unit: '元/天', description: '每本图书每天逾期罚款金额' },
  { key: 'MAX_BORROW_STUDENT', label: '最大借阅数量', type: 'int', defaultValue: 5, unit: '本', description: '单个读者最多同时借阅图书数量' },
  { key: 'LOAN_DURATION_DAYS', label: '默认借阅天数', type: 'int', defaultValue: 14, unit: '天', description: '每次借阅的默认应还天数' },
  { key: 'GRACE_DAYS', label: '宽限天数', type: 'int', defaultValue: 3, unit: '天', description: '逾期多少天内不罚款' },
  { key: 'FINE_CAP', label: '单本罚款上限（元）', type: 'float', defaultValue: 30, unit: '元', description: '单本书累计罚款最高金额' },
  { key: 'MAX_RENEW_TIMES', label: '最大续借次数', type: 'int', defaultValue: 2, unit: '次', description: '每本图书最多续借次数' },
  { key: 'RENEW_DURATION_DAYS', label: '续借时长（天）', type: 'int', defaultValue: 15, unit: '天', description: '每次续借增加的借阅天数' },
  { key: 'LIBRARY_NAME', label: '图书馆名称', type: 'text', defaultValue: '图书馆', unit: '', description: '系统显示的图书馆名称' },
  { key: 'LIBRARY_HOURS', label: '开放时间', type: 'text', defaultValue: '周一至周五 8:00-22:00，周末 9:00-21:00', unit: '', description: '图书馆对外开放时间' },
  { key: 'CONTACT_EMAIL', label: '联系邮箱', type: 'text', defaultValue: 'library@university.edu', unit: '', description: '图书馆联系邮箱地址' },
  { key: 'CONTACT_PHONE', label: '联系电话', type: 'text', defaultValue: '123-4567-8901', unit: '', description: '图书馆联系电话' },
];

export default function SystemConfig() {
  const { apiRequest } = useAuth();
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadConfigs();
  }, []);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/config');
      setConfigs(data);
    } catch (err) {
      showMessage('error', '加载配置失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (key, currentValue) => {
    setEditingKey(key);
    setEditValue(currentValue !== undefined && currentValue !== null ? String(currentValue) : '');
  };

  const handleSave = async (key, type) => {
    let parsedValue = editValue;
    if (type === 'int') {
      const intVal = parseInt(editValue, 10);
      if (isNaN(intVal)) {
        showMessage('error', '请输入整数');
        return;
      }
      parsedValue = intVal;
    } else if (type === 'float') {
      const floatVal = parseFloat(editValue);
      if (isNaN(floatVal)) {
        showMessage('error', '请输入数字');
        return;
      }
      parsedValue = floatVal;
    }
    try {
      await apiRequest(`/config/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value: String(parsedValue) }),
      });
      await loadConfigs();
      showMessage('success', `${key} 更新成功`);
      setEditingKey(null);
    } catch (err) {
      showMessage('error', `更新失败: ${err.message}`);
    }
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          系统全局参数配置
        </h1>
        <p className="text-gray-600 mt-1">
          修改以下参数将影响借阅规则、逾期罚款策略。修改后立即生效，已产生的借阅记录不受影响（仅对新操作生效）。
        </p>
      </div>

      {message.text && (
        <div
          className={`mb-4 p-3 rounded-md flex items-center gap-2 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg border">
        <div className="divide-y">
          {CONFIG_DEFINITIONS.map((def) => {
            const currentVal = configs[def.key] !== undefined ? configs[def.key] : def.defaultValue;
            return (
              <div key={def.key} className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 gap-3 hover:bg-gray-50 transition-colors">
                <div className="flex-1">
                  <Label className="font-medium">{def.label}</Label>
                  <p className="text-sm text-gray-500">{def.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {editingKey === def.key ? (
                    <>
                      {def.type === 'text' ? (
                        <Input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-64"
                          autoFocus
                        />
                      ) : (
                        <Input
                          type="number"
                          step={def.type === 'float' ? '0.01' : '1'}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-28"
                          autoFocus
                        />
                      )}
                      <Button size="sm" onClick={() => handleSave(def.key, def.type)}>保存</Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>取消</Button>
                    </>
                  ) : (
                    <>
                      <span className={`font-mono text-sm ${def.type === 'text' ? '' : 'w-24 text-right'}`}>
                        {currentVal}{def.unit && ` ${def.unit}`}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => startEdit(def.key, currentVal)}>
                        编辑
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-6 py-3 bg-gray-50 text-xs text-gray-500 rounded-b-lg">
          * 修改罚款费率后，新产生的逾期罚款将按新费率计算；已归还的罚款记录不会改变。
        </div>
      </div>
    </div>
  );
}
