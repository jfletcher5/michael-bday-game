'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, setCurrentUser } from '../lib/auth';
import {
  acceptFriendRequest,
  blockUser,
  clearChatUnread,
  createRaceChallenge,
  declineFriendRequest,
  getFriendsList,
  getIncomingFriendRequests,
  getUserData,
  searchPlayersByPrefix,
  sendChatMessage,
  sendFriendRequest,
  subscribeToChatMessages,
  touchUserPresence,
  unfriendUser,
  getDisplayName,
} from '../lib/firestore';
import type { ChatMessage, FriendRequest, User } from '../lib/types';
import MenuBackground from '../components/MenuBackground';
import TopNav from '../components/TopNav';

/** Friends, chat, and race challenges (MIE-20). */
export default function FriendsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [friends, setFriends] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [raceTarget, setRaceTarget] = useState('300');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.push('/login');
      return;
    }
    setUser(current);
    touchUserPresence(current.username);
    const interval = setInterval(() => touchUserPresence(current.username), 60000);
    refreshSocial(current.username);
    return () => clearInterval(interval);
  }, [router]);

  const refreshSocial = async (username: string) => {
    setFriends(await getFriendsList(username));
    setIncoming(await getIncomingFriendRequests(username));
    const fresh = await getUserData(username);
    if (fresh) {
      setUser(fresh);
      setCurrentUser(fresh);
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchPlayersByPrefix(searchTerm).then(setSearchResults);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    if (!user || !activeChat) return;
    void clearChatUnread(user.username, activeChat);
    return subscribeToChatMessages(user.username, activeChat, setMessages);
  }, [user, activeChat]);

  const handleSendChat = async () => {
    if (!user || !activeChat || !chatInput.trim()) return;
    await sendChatMessage(user.username, activeChat, chatInput);
    setChatInput('');
  };

  const handleRace = async (friend: string) => {
    if (!user) return;
    const meters = parseInt(raceTarget, 10);
    if (!Number.isFinite(meters) || meters < 50) {
      setError('Pick at least 50 meters');
      return;
    }
    const race = await createRaceChallenge(user.username, friend, meters);
    router.push(`/game?raceId=${race.id}`);
  };

  if (!user) return null;

  return (
    <MenuBackground className="min-h-screen p-4 py-20">
      <TopNav user={user} transparent />
      <main className="max-w-3xl mx-auto bg-white rounded-3xl shadow-glow p-6 ring-1 ring-black/5">
        <h1 className="text-2xl font-bold mb-4">👥 Friends</h1>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <section className="mb-6">
          <h2 className="font-semibold mb-2">Add Friend</h2>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search players..."
            className="w-full border rounded-lg px-3 py-2 mb-2"
          />
          <ul className="space-y-1">
            {searchResults.map((p) => (
              <li key={p.username} className="flex justify-between items-center text-sm">
                <span>{getDisplayName(p)}</span>
                <button
                  type="button"
                  className="text-purple-600"
                  onClick={async () => {
                    try {
                      await sendFriendRequest(user.username, p.username);
                      setError(null);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed');
                    }
                  }}
                >
                  Send request
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="font-semibold mb-2">Incoming Requests</h2>
          {incoming.length === 0 ? (
            <p className="text-gray-500 text-sm">None</p>
          ) : (
            incoming.map((req) => (
              <div key={req.id} className="flex items-center gap-2 mb-2 text-sm">
                <span>{req.fromUsername}</span>
                <button
                  type="button"
                  className="px-2 py-1 bg-green-600 text-white rounded"
                  onClick={() => acceptFriendRequest(req.id).then(() => refreshSocial(user.username))}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="px-2 py-1 bg-red-500 text-white rounded"
                  onClick={() => declineFriendRequest(req.id).then(() => refreshSocial(user.username))}
                >
                  Decline
                </button>
              </div>
            ))
          )}
        </section>

        <section className="mb-6">
          <h2 className="font-semibold mb-2">Friends ({friends.length})</h2>
          <ul className="space-y-2">
            {friends.map((friend) => {
              const unread = user.unreadChats?.[friend] ?? 0;
              return (
                <li key={friend} className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-gray-50">
                  <span className="font-medium flex-1">{friend}</span>
                  {unread > 0 && (
                    <span className="bg-red-600 text-white text-xs rounded-full px-2 py-0.5">{unread}</span>
                  )}
                  <button type="button" className="text-sm text-blue-600" onClick={() => setActiveChat(friend)}>
                    Chat
                  </button>
                  <input
                    type="number"
                    value={raceTarget}
                    onChange={(e) => setRaceTarget(e.target.value)}
                    className="w-16 border rounded px-1 text-sm"
                    title="Race target meters"
                  />
                  <button type="button" className="text-sm text-orange-600" onClick={() => handleRace(friend)}>
                    Race
                  </button>
                  <button
                    type="button"
                    className="text-sm text-gray-500"
                    onClick={() => unfriendUser(user.username, friend).then(() => refreshSocial(user.username))}
                  >
                    Unfriend
                  </button>
                  <button
                    type="button"
                    className="text-sm text-red-500"
                    onClick={() => blockUser(user.username, friend).then(() => refreshSocial(user.username))}
                  >
                    Block
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {activeChat && (
          <section className="border-t pt-4">
            <h2 className="font-semibold mb-2">Chat with {activeChat}</h2>
            <div className="h-48 overflow-y-auto border rounded-lg p-2 mb-2 space-y-2">
              {messages.map((m) => {
                const mine = m.fromUsername === user.username;
                return (
                  <div
                    key={m.id}
                    className={`max-w-[80%] px-3 py-2 rounded-lg text-sm text-white ${
                      mine ? 'bg-blue-600 ml-auto' : 'bg-gray-500'
                    }`}
                  >
                    {m.text}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2"
                onKeyDown={(e) => e.key === 'Enter' && void handleSendChat()}
              />
              <button type="button" onClick={() => void handleSendChat()} className="px-4 py-2 bg-purple-600 text-white rounded-lg">
                Send
              </button>
            </div>
          </section>
        )}
      </main>
    </MenuBackground>
  );
}
