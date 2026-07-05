'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createUser, loginUser } from '../lib/firestore';
import { setCurrentUser } from '../lib/auth';
import { AVATAR_OPTIONS, getAvatarUrl } from '../lib/avatars';
import { formatDisplayName, validateDisplayName, DISPLAY_NAME_MAX_LENGTH } from '../lib/displayName';
import MenuBackground from '../components/MenuBackground';
import { Alert } from '../components/ui';

/**
 * Login/Register Page (MIE-23)
 * Custom display names up to 10 characters at signup.
 */
export default function LoginPage() {
  const router = useRouter();

  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState<number>(1);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(formatDisplayName(e.target.value));
  };

  const nameValidation = username.length > 0 ? validateDisplayName(username) : null;

  const isFormValid = () => {
    if (!nameValidation?.ok) return false;
    if (password.length < 4) return false;
    if (isRegister && password !== confirmPassword) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isRegister) {
        const user = await createUser({ username, password }, selectedAvatarId);
        setCurrentUser(user);
      } else {
        const user = await loginUser({ username, password });
        setCurrentUser(user);
      }
      router.push('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    setError(null);
    setConfirmPassword('');
  };

  return (
    <MenuBackground className="min-h-screen flex flex-col items-center justify-center p-4 py-8">
      <main className="bg-white rounded-3xl shadow-glow ring-1 ring-black/5 p-6 sm:p-8 w-full max-w-md md:max-w-4xl mx-2 sm:mx-4 my-auto animate-page-in">
        <div className="text-center mb-5 sm:mb-7">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-800 tracking-tight mb-1 sm:mb-2">
            {isRegister ? 'Create Account' : 'Login'}
          </h1>
          <p className="text-gray-600">{isRegister ? 'Pick your name and join!' : 'Welcome back!'}</p>
        </div>

        <div className="flex flex-col md:flex-row md:gap-8">
          {isRegister && (
            <div className="mb-6 md:mb-0 md:w-1/2">
              <label className="block text-sm font-medium text-gray-700 mb-3">Choose Your Character</label>
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                {AVATAR_OPTIONS.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setSelectedAvatarId(avatar.id)}
                    className={`relative p-2 sm:p-3 rounded-xl transition-all transform hover:scale-105 min-h-[60px] ${
                      selectedAvatarId === avatar.id
                        ? 'bg-purple-100 ring-2 ring-purple-500 shadow-md'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    <Image
                      src={getAvatarUrl(avatar.id)}
                      alt={avatar.name}
                      width={64}
                      height={64}
                      className="w-full h-auto rounded-lg"
                      unoptimized
                    />
                    <span className="block text-xs text-gray-600 mt-1 font-medium">{avatar.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={`md:w-1/2 flex flex-col ${!isRegister ? 'md:mx-auto md:max-w-md' : ''}`}>
            {error && <Alert className="mb-4">{error}</Alert>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Name (up to {DISPLAY_NAME_MAX_LENGTH} characters)
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  placeholder="Your name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition text-center text-lg font-bold"
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  required
                />
                {nameValidation && !nameValidation.ok && (
                  <p className="text-xs text-red-500 mt-1">{nameValidation.error}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                  minLength={4}
                  required
                />
              </div>

              {isRegister && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    required
                  />
                  {confirmPassword.length > 0 && password !== confirmPassword && (
                    <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={!isFormValid() || isLoading}
                className={`w-full font-semibold min-h-[52px] py-3 px-6 rounded-xl transition-all shadow-lg ${
                  isFormValid() && !isLoading
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isLoading ? 'Please wait...' : isRegister ? 'Create Account' : 'Login'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button onClick={toggleMode} className="text-purple-600 hover:text-purple-700 font-medium text-sm">
                {isRegister ? 'Already have an account? Login' : "Don't have an account? Create one"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </MenuBackground>
  );
}
