//go:build ignore

// dump-go-unicode writes the Unicode data the AgentKit reference
// implementation (Go skilltree package) validates paths with: general
// category from the Go unicode tables and canonical normalization from
// golang.org/x/text/unicode/norm, both pinned to Unicode 15.0.0. The output
// is the input of gen-unicode-tables.mjs, so the TypeScript tables match the
// reference exactly.
//
// Run it from the AgentKit apps/cli module, which pins x/text:
//
//	cd <agentkit>/apps/cli && go run <skillx>/packages/skill-tree/scripts/dump-go-unicode.go > <skillx>/packages/skill-tree/scripts/unicode-15.0.0-go.json
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

type dump struct {
	UnicodeVersion string    `json:"unicodeVersion"`
	NormVersion    string    `json:"normVersion"`
	GoVersion      string    `json:"goVersion"`
	Assigned       [][2]rune `json:"assigned"`
	Format         [][2]rune `json:"format"`
	CombiningClass [][2]rune `json:"combiningClass"`
	// Decompositions maps a code point to its canonical decomposition: the
	// one-step pair for a primary composite, the full decomposition otherwise.
	Decompositions [][]rune `json:"decompositions"`
	Composites     []rune   `json:"composites"`
}

func addRange(ranges [][2]rune, r rune) [][2]rune {
	if n := len(ranges); n > 0 && ranges[n-1][1]+1 == r {
		ranges[n-1][1] = r
		return ranges
	}
	return append(ranges, [2]rune{r, r})
}

// compositePair finds the canonical pair (a, b) that NFC composes into r: b
// is one code point of the full decomposition and a is the NFC of the rest,
// which must be a single code point.
func compositePair(r rune, full []rune) ([2]rune, bool) {
	for k := len(full) - 1; k >= 1; k-- {
		rest := append(append([]rune{}, full[:k]...), full[k+1:]...)
		a := norm.NFC.String(string(rest))
		if utf8.RuneCountInString(a) != 1 {
			continue
		}
		ar, _ := utf8.DecodeRuneInString(a)
		if norm.NFC.String(a+string(full[k])) == string(r) {
			return [2]rune{ar, full[k]}, true
		}
	}
	return [2]rune{}, false
}

func main() {
	d := dump{UnicodeVersion: unicode.Version, NormVersion: norm.Version, GoVersion: runtime.Version()}
	for r := rune(0); r <= unicode.MaxRune; r++ {
		if unicode.In(r, unicode.L, unicode.M, unicode.N, unicode.P, unicode.S, unicode.Z, unicode.Cc, unicode.Cf, unicode.Co, unicode.Cs) {
			d.Assigned = addRange(d.Assigned, r)
		}
		if unicode.Is(unicode.Cf, r) {
			d.Format = addRange(d.Format, r)
		}
		if r >= 0xD800 && r <= 0xDFFF {
			continue
		}
		s := string(r)
		props := norm.NFD.PropertiesString(s)
		if ccc := props.CCC(); ccc != 0 {
			d.CombiningClass = append(d.CombiningClass, [2]rune{r, rune(ccc)})
		}
		if r >= 0xAC00 && r <= 0xD7A3 {
			continue // Hangul syllables are algorithmic.
		}
		full := []rune(norm.NFD.String(s))
		if len(full) == 1 && full[0] == r {
			continue
		}
		if norm.NFC.String(s) == s && len(full) > 1 {
			pair, ok := compositePair(r, full)
			if !ok {
				fmt.Fprintf(os.Stderr, "no canonical pair for U+%04X\n", r)
				os.Exit(1)
			}
			d.Decompositions = append(d.Decompositions, []rune{r, pair[0], pair[1]})
			d.Composites = append(d.Composites, r)
			continue
		}
		d.Decompositions = append(d.Decompositions, append([]rune{r}, full...))
	}
	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(d); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
