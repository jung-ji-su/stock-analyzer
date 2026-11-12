'use client';

import { createContext, useContext, useState } from 'react';

const FavoritesContext = createContext();

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('favorites'));
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  const toggleFavorite = (stock) => {
    const newFavorites = favorites.some(f => f.code === stock.code)
      ? favorites.filter(f => f.code !== stock.code)
      : [...favorites, stock];
    
    setFavorites(newFavorites);
    localStorage.setItem('favorites', JSON.stringify(newFavorites));
  };

  const isFavorite = (code) => {
    return favorites.some(f => f.code === code);
  };

  return (
    <FavoritesContext.Provider value={{ favorites, toggleFavorite, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);