'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createUser, loginUser } from '../lib/firestore';
import { setCurrentUser } from '../lib/auth';
import { AVATAR_OPTIONS, getAvatarUrl, formatInitials, validateInitials } from '../lib/avatars';

/**
 * Login/Register Page
 * Allows users to create an account or log in with existing credentials
 * Uses 3-letter initials as username
 */
export default function LoginPage() {
  const router = useRouter();
  
  // Form state
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState<number>(1);
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle username input (3 letters only)
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatInitials(e.target.value);
    setUsername(formatted);
  };

  // Validate form before submission
  const isFormValid = () => {
    if (!validateInitials(username)) return false;
    if (password.length < 4) return false;
    if (isRegister && password !== confirmPassword) return false;
    return true;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isRegister) {
        // Create new account
        const user = await createUser(
          { username, password },
          selectedAvatarId
        );
        setCurrentUser(user);
        console.log('Account created successfully');
      } else {
        // Login existing account
        const user = await loginUser({ username, password });
        setCurrentUser(user);
        console.log('Logged in successfully');
      }
      
      // Redirect to main menu
      router.push('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle between login and register modes
  const toggleMode = () => {
    setIsRegister(!isRegister);
    setError(null);
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4">
      <main className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 w-full max-w-md md:max-w-4xl mx-4">
        {/* Page Title */}
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
            {isRegister ? 'Create Account' : 'Login'}
          </h1>
          <p className="text-gray-600">
            {isRegister ? 'Join Platform Drop!' : 'Welcome back!'}
          </p>
        </div>

        {/* Two Column Layout: Character Select (Left) | Form Inputs (Right) */}
        <div className="flex flex-col md:flex-row md:gap-8">
          {/* LEFT COLUMN: Character Selection (Register only) */}
          {isRegister && (
            <div className="mb-6 md:mb-0 md:w-1/2">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Choose Your Character
              </label>
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                {AVATAR_OPTIONS.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setSelectedAvatarId(avatar.id)}
                    className={`relative p-2 md:p-3 rounded-xl transition-all transform hover:scale-105 ${
                      selectedAvatarId === avatar.id
                        ? 'bg-purple-100 ring-2 ring-purple-500 shadow-md'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                    aria-label={`Select ${avatar.name}`}
                  >
                    <Image
                      src={getAvatarUrl(avatar.id)}
                      alt={avatar.name}
                      width={64}
                      height={64}
                      className="w-full h-auto rounded-lg"
                      unoptimized
                    />
                    <span className="block text-xs text-gray-600 mt-1 font-medium">
                      {avatar.name}
                    </span>
                    {selectedAvatarId === avatar.id && (
                      <div className="absolute -top-1 -right-1 bg-purple-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                        ✓
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* RIGHT COLUMN: Form Inputs and Info */}
          <div className={`md:w-1/2 flex flex-col ${!isRegister ? 'md:mx-auto md:max-w-md' : ''}`}>
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-600 text-center">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username Input (3 letters) */}
              <div>
                <label 
                  htmlFor="username" 
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Username (3 letters)
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  placeholder="ABC"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition text-center text-xl md:text-2xl font-bold tracking-widest uppercase"
                  maxLength={3}
                  required
                />
                {username.length > 0 && username.length < 3 && (
                  <p className="text-xs text-orange-500 mt-1">
                    Please enter exactly 3 letters
                  </p>
                )}
              </div>

              {/* Password Input */}
              <div>
                <label 
                  htmlFor="password" 
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                  minLength={4}
                  required
                />
                {password.length > 0 && password.length < 4 && (
                  <p className="text-xs text-orange-500 mt-1">
                    Password must be at least 4 characters
                  </p>
                )}
              </div>

              {/* Confirm Password (Register only) */}
              {isRegister && (
                <div>
                  <label 
                    htmlFor="confirmPassword" 
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                    required
                  />
                  {confirmPassword.length > 0 && password !== confirmPassword && (
                    <p className="text-xs text-red-500 mt-1">
                      Passwords do not match
                    </p>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!isFormValid() || isLoading}
                className={`w-full font-semibold py-3 px-6 rounded-lg transition-all transform shadow-lg ${
                  isFormValid() && !isLoading
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 hover:scale-105'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isLoading ? 'Please wait...' : isRegister ? 'Create Account' : 'Login'}
              </button>
            </form>

            {/* Toggle Login/Register */}
            <div className="mt-6 text-center">
              <p className="text-gray-600 text-sm">
                {isRegister ? 'Already have an account?' : "Don't have an account?"}
              </p>
              <button
                onClick={toggleMode}
                className="text-purple-600 hover:text-purple-700 font-medium text-sm mt-1"
              >
                {isRegister ? 'Login here' : 'Create one'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
