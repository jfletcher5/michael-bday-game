'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getScoresFromFirestore, PaginatedScoresResult } from '../lib/firestore';
import { Score } from '../lib/types';
import { getAvatarUrl } from '../lib/avatars';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

// Number of scores to display per page
const PAGE_SIZE = 5;

/**
 * Leaderboard Page
 * Displays top scores from Firebase Firestore sorted by distance (descending)
 * Features paginated display with Previous/Next navigation
 */
export default function Leaderboard() {
  const router = useRouter();
  const [scores, setScores] = useState<Score[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  // Store cursors for each page to enable "Previous" navigation
  const [pageCursors, setPageCursors] = useState<(QueryDocumentSnapshot<DocumentData> | null)[]>([null]);

  // Load scores for a specific page
  const loadPage = useCallback(async (pageNum: number, startAfterDoc?: QueryDocumentSnapshot<DocumentData> | null) => {
    try {
      setIsLoading(true);
      const result: PaginatedScoresResult = await getScoresFromFirestore(PAGE_SIZE, startAfterDoc);
      setScores(result.scores);
      setHasMore(result.hasMore);
      setCurrentPage(pageNum);
      
      // Store the cursor for this page (for navigating back)
      if (result.lastDoc && pageNum >= pageCursors.length) {
        setPageCursors(prev => [...prev, result.lastDoc]);
      }
      
      setError(null);
    } catch (err) {
      console.error('Failed to load scores:', err);
      setError('Failed to load leaderboard. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [pageCursors.length]);

  // Load first page on mount
  useEffect(() => {
    loadPage(1, null);
  }, []);

  // Handle "Next" page navigation
  const handleNextPage = () => {
    if (hasMore && !isLoading) {
      // Get the cursor from the last loaded page
      const lastCursor = pageCursors[currentPage] || null;
      loadPage(currentPage + 1, lastCursor);
    }
  };

  // Handle "Previous" page navigation
  const handlePreviousPage = () => {
    if (currentPage > 1 && !isLoading) {
      // Go back to previous page using stored cursor
      // For page 2, we use null (first page); for page 3+, we use the cursor from page-2
      const prevCursor = currentPage > 2 ? pageCursors[currentPage - 2] : null;
      loadPage(currentPage - 1, prevCursor);
    }
  };

  // Handle "Go to Top" navigation - jump to page 1
  const handleGoToTop = () => {
    if (currentPage > 1 && !isLoading) {
      loadPage(1, null);
    }
  };

  // Navigate back to main menu
  const handleBackToMenu = () => {
    router.push('/');
  };

  // Calculate rank based on page and index
  const getRank = (index: number): number => {
    return (currentPage - 1) * PAGE_SIZE + index + 1;
  };

  // Get rank display (medal or number)
  const getRankDisplay = (rank: number): string => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}.`;
  };

  // Get rank style class
  const getRankStyle = (rank: number): string => {
    if (rank === 1) return 'text-yellow-600 text-xl';
    if (rank === 2) return 'text-gray-500 text-lg';
    if (rank === 3) return 'text-orange-600';
    return 'text-gray-700';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4">
      <main className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-2xl">
        {/* Page Title */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Leaderboard
          </h1>
          <p className="text-gray-600">
            Top Players
          </p>
        </div>

        {/* Go to Top Button - Only show when not on page 1 */}
        {currentPage > 1 && !isLoading && (
          <div className="mb-4">
            <button
              onClick={handleGoToTop}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-2 px-4 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-md text-sm"
            >
              Go to Top of Leaderboard
            </button>
          </div>
        )}

        {/* Leaderboard Table */}
        {isLoading && scores.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Loading scores...
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500 mb-2">{error}</p>
            <button 
              onClick={() => loadPage(1, null)} 
              className="text-purple-600 hover:text-purple-700 underline"
            >
              Retry
            </button>
          </div>
        ) : scores.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No scores yet. Be the first to play!
          </div>
        ) : (
          <div>
            {/* Leaderboard entries */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="border-b border-gray-200">
                    <th className="py-3 px-3 text-left text-sm font-semibold text-gray-700 w-16">
                      Rank
                    </th>
                    <th className="py-3 px-3 text-left text-sm font-semibold text-gray-700">
                      Player
                    </th>
                    <th className="py-3 px-4 text-right text-sm font-semibold text-gray-700 w-28">
                      Distance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((score, index) => {
                    const rank = getRank(index);
                    return (
                      <tr 
                        key={index}
                        className={`border-b border-gray-100 hover:bg-gray-50 transition ${
                          rank === 1 ? 'bg-yellow-50' : ''
                        }`}
                      >
                        {/* Rank Column */}
                        <td className="py-4 px-3">
                          <span className={`font-bold ${getRankStyle(rank)}`}>
                            {getRankDisplay(rank)}
                          </span>
                        </td>
                        
                        {/* Player Column - Avatar + Initials */}
                        <td className="py-4 px-3">
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <Image
                              src={getAvatarUrl(score.avatarId)}
                              alt="Player avatar"
                              width={40}
                              height={40}
                              className="rounded-full bg-gray-100"
                              unoptimized
                            />
                            {/* Initials */}
                            <span className="font-bold text-gray-800 text-lg tracking-wide">
                              {score.initials}
                            </span>
                          </div>
                        </td>
                        
                        {/* Distance Column */}
                        <td className="py-4 px-4 text-right font-semibold text-purple-600 text-lg">
                          {score.distance}m
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between mt-6">
              {/* Previous Button */}
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1 || isLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                  currentPage === 1 || isLoading
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <span>←</span>
                <span>Previous</span>
              </button>

              {/* Page Indicator */}
              <span className="text-gray-600 font-medium">
                Page {currentPage}
              </span>

              {/* Next Button */}
              <button
                onClick={handleNextPage}
                disabled={!hasMore || isLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                  !hasMore || isLoading
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <span>Next</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* Back Button */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={handleBackToMenu}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg"
          >
            Back to Menu
          </button>
        </div>
      </main>
    </div>
  );
}
