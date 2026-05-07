import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchAllConfigs, updateConfig } from '@/lib/api';

// 配置定义：key, label, type, 默认值, 单位, 描述
const CONFIG_DEFINITIONS = [
  { key: 'FINE_RATE_PER_DAY', label: '逾期日罚款（元/天）', type: 'float', defaultValue: 0.5, unit: '元/天', description: '每本图书每天逾期罚款金额' },
  { key: 'BORROW_LIMIT', label: '最大借阅数量', type: 'int', defaultValue: 5, unit: '本', description: '单个读者最多同时借阅图书数量' },
  { key: 'LOAN_PERIOD_DAYS', label: '默认借阅天数', type: 'int', defaultValue: 14, unit: '天', description: '每次借阅的默认应还天数' },
  { key: 'GRACE_DAYS', label: '宽限天数', type: 'int', defaultValue: 3, unit: '天', description: '逾期多少天内不罚款' },
  { key: 'FINE_CAP', label: '单本罚款上限（元）', type: 'float', defaultValue: 30, unit: '元', description: '单本书累计罚款最高金额' },
  { key: 'RENEWAL_LIMIT', label: '最大续借次数', type: 'int', defaultValue: 2, unit: '次', description: '每本图书最多续借次数' },
];

export default function SystemConfig() {
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const data = await fetchAllConfigs();
      setConfigs(data);
    } catch (err) {
      console.error(err);
      alert('加载配置失败，请稍后重试');
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
        alert('请输入整数');
        return;
      }
      parsedValue = intVal;
    } else if (type === 'float') {
      const floatVal = parseFloat(editValue);
      if (isNaN(floatVal)) {
        alert('请输入数字');
        return;
      }
      parsedValue = floatVal;
    }
    try {
      await updateConfig(key, String(parsedValue), type, '');
      await loadConfigs(); // 重新加载
      alert(`${key} 更新成功`);
      setEditingKey(null);
    } catch (err) {
      console.error(err);
      alert(`更新失败: ${err.message}`);
    }
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">加载系统配置中...</div>;
  }

  return (
    <Card className="max-w-3xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>系统全局参数配置</CardTitle>
        <CardDescription>
          修改以下参数将影响借阅规则、逾期罚款策略。修改后立即生效，已产生的借阅记录不受影响（仅对新操作生效）。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {CONFIG_DEFINITIONS.map((def) => {
          const currentVal = configs[def.key] !== undefined ? configs[def.key] : def.defaultValue;
          return (
            <div key={def.key} className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-3">
              <div className="flex-1">
                <Label className="font-medium">{def.label}</Label>
                <p className="text-sm text-muted-foreground">{def.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {editingKey === def.key ? (
                  <>
                    <Input
                      type="number"
                      step={def.type === 'float' ? '0.01' : '1'}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-28"
                      autoFocus
                    />
                    <Button size="sm" onClick={() => handleSave(def.key, def.type)}>保存</Button>
                    <Button size="sm" variant="outline" onClick={cancelEdit}>取消</Button>
                  </>
                ) : (
                  <>
                    <span className="w-24 text-right font-mono">
                      {currentVal} {def.unit}
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
        <div className="text-xs text-muted-foreground pt-2">
          * 修改罚款费率后，新产生的逾期罚款将按新费率计算；已归还的罚款记录不会改变。
        </div>
      </CardContent>
    </Card>
  );
}