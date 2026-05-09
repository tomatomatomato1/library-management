import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Send, User } from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');  // 改为统一 token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || '请求失败');
  }
  return data;
}



export default function LibrarianMessages() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversations]);

  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((sum, conversation) => sum + (conversation.unreadCount || 0), 0);
  }, [conversations]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const data = await request('/messages/conversations');
      setConversations(data);
      setError('');
    } catch (err) {
      setError(err.message || '加载会话失败');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (otherUserId) => {
    try {
      setLoading(true);
      const data = await request(`/messages/conversation/${otherUserId}`);
      setMessages(data);
      setError('');
    } catch (err) {
      setError(err.message || '加载消息失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
    setConversations((prev) =>
      prev.map((item) =>
        item.userId === conversation.userId ? { ...item, unreadCount: 0 } : item
      )
    );
    loadMessages(conversation.userId);
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !newMessage.trim()) return;
    try {
      setSending(true);
      const created = await request('/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          receiverId: selectedConversation.userId,
          content: newMessage.trim(),
        }),
      });
      setMessages((prev) => [...prev, created]);
      setNewMessage('');
      await loadConversations();
    } catch (err) {
      setError(err.message || '发送失败');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadConversations();
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedConversation && sortedConversations.length > 0) {
      handleSelectConversation(sortedConversations[0]);
    }
  }, [selectedConversation, sortedConversations]);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    const latestConversation = sortedConversations.find(
      (conversation) => conversation.userId === selectedConversation.userId
    );

    if (
      latestConversation?.lastMessage?.id &&
      latestConversation.lastMessage.id !== messages[messages.length - 1]?.id
    ) {
      loadMessages(selectedConversation.userId);
    }
  }, [sortedConversations, selectedConversation, messages]);

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          读者消息
          {totalUnreadCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              未读 {totalUnreadCount}
            </span>
          )}
        </h3>
        <button
          onClick={loadConversations}
          className="text-sm px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50"
        >
          刷新
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-md bg-red-100 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 border rounded-lg h-[560px] overflow-y-auto p-2">
          {loading && sortedConversations.length === 0 ? (
            <div className="text-sm text-gray-500 p-2">加载中...</div>
          ) : sortedConversations.length === 0 ? (
            <div className="text-sm text-gray-400 p-2">暂无读者会话</div>
          ) : (
            sortedConversations.map((conversation) => (
              <div
                key={conversation.userId}
                onClick={() => handleSelectConversation(conversation)}
                className={`cursor-pointer p-3 rounded-md mb-2 border ${
                  selectedConversation?.userId === conversation.userId
                    ? 'bg-blue-50 border-blue-200'
                    : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conversation.userName}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {conversation.lastMessage?.content || '点击查看会话'}
                    </p>
                  </div>
                  {conversation.unreadCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                      {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="lg:col-span-3 border rounded-lg h-[560px] flex flex-col">
          {selectedConversation ? (
            <>
              <div className="p-3 border-b">
                <p className="font-semibold">{selectedConversation.userName}</p>
                <p className="text-xs text-gray-500">{selectedConversation.userRole}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-3 bg-gray-50 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-gray-400 text-sm">暂无聊天记录</div>
                ) : (
                  messages.map((message) => {
                    const isSentByLibrarian = message.sender?.role === 'LIBRARIAN';
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isSentByLibrarian ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[75%] px-3 py-2 rounded-lg ${
                            isSentByLibrarian ? 'bg-blue-500 text-white' : 'bg-white border'
                          }`}
                        >
                          <p className="text-sm break-words">{message.content}</p>
                          <p
                            className={`text-[11px] mt-1 ${
                              isSentByLibrarian ? 'text-blue-100' : 'text-gray-500'
                            }`}
                          >
                            {formatTime(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-3 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendMessage();
                    }}
                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                    placeholder="输入回复内容..."
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !newMessage.trim()}
                    className="px-3 py-2 bg-blue-500 text-white rounded-md disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              请选择左侧一个会话
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
