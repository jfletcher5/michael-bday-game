'use client';

import { useCallback, useEffect, useState } from 'react';
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
  getOutgoingFriendRequests,
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
  // Lazy init avoids synchronous setState-in-effect on mount.
  const [user, setUser] = useState<User | null>(() => getCurrentUser());
  const [friends, setFriends] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [raceTarget, setRaceTarget] = useState('300');
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Declared before mount effect so the effect can call a stable loader (lint).
  const refreshSocial = useCallback(async (username: string) => {
    try {
      const [friendList, incomingReqs, outgoingReqs] = await Promise.all([
        getFriendsList(username),
        getIncomingFriendRequests(username),
        getOutgoingFriendRequests(username),
      ]);
      setFriends(friendList);
      setIncoming(incomingReqs);
      setOutgoing(outgoingReqs);
      const fresh = await getUserData(username);
      if (fresh) {
        setUser(fresh);
        setCurrentUser(fresh);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load friends');
    }
  }, []);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    const username = user.username;
    touchUserPresence(username);
    const interval = setInterval(() => touchUserPresence(username), 60000);
    // Defer so setState from refreshSocial is not synchronous inside the effect body.
    const loadId = window.setTimeout(() => {
      void refreshSocial(username);
    }, 0);
    return () => {
      clearInterval(interval);
      window.clearTimeout(loadId);
    };
  }, [router, refreshSocial, user]);

  // Derive empty search results without setState-in-effect when the term is blank.
  useEffect(() => {
    if (!searchTerm.trim()) return;
    const t = setTimeout(() => {
      searchPlayersByPrefix(searchTerm).then(setSearchResults);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const visibleSearchResults = searchTerm.trim() ? searchResults : [];

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
        {statusMsg && <p className="text-green-700 text-sm mb-3">{statusMsg}</p>}

        <section className="mb-6">
          <h2 className="font-semibold mb-2">Add Friend</h2>
          <label htmlFor="friend-search" className="sr-only">Search players</label>
          <input
            id="friend-search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search players…"
            className="w-full border rounded-lg px-3 py-2 mb-2"
            autoComplete="off"
            spellCheck={false}
          />
          <ul className="space-y-1">
            {visibleSearchResults.map((p) => (
              <li key={p.username} className="flex justify-between items-center text-sm">
                <span>{getDisplayName(p)}</span>
                <button
                  type="button"
                  className="text-purple-600"
                  onClick={async () => {
                    try {
                      await sendFriendRequest(user.username, p.username);
                      setError(null);
                      setStatusMsg(`Request sent to ${getDisplayName(p)}`);
                      await refreshSocial(user.username);
                    } catch (e) {
                      setStatusMsg(null);
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
          <h2 className="font-semibold mb-2">Sent Requests</h2>
          {outgoing.length === 0 ? (
            <p className="text-gray-500 text-sm">None</p>
          ) : (
            outgoing.map((req) => (
              <div key={req.id} className="text-sm text-gray-700 mb-1">
                Pending → {req.toUsername}
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
