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
//
// With -vectors it writes the stream-safe normalization vectors instead
// (scripts/stream-safe-15.0.0-go-vectors.json).
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"runtime"
	"strings"
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
	// StreamSafe lists [code point, leading, trailing] non-starter counts
	// that x/text norm uses for Stream-Safe Text Processing: a run of more
	// than 30 non-starters gets a U+034F CGJ inserted, so a path holding one
	// is not NFC. The counts are unexported, so they are measured.
	StreamSafe [][3]rune `json:"streamSafe"`
}

const (
	cgj            = "͏"
	probeMark      = "̅" // a non-starter that never composes
	maxNonStarters = 30
)

// overflows reports whether NFD inserts a CGJ into s.
func overflows(s string) bool {
	return strings.Count(norm.NFD.String(s), cgj) > strings.Count(s, cgj)
}

// nonStarters measures how many non-starters r adds before (lead) or after
// (trail) itself: k marks plus r overflow exactly when k+count > 30.
func nonStarters(r rune, lead bool) rune {
	count := rune(0)
	for k := maxNonStarters; k >= maxNonStarters-3; k-- {
		marks := strings.Repeat(probeMark, k)
		s := string(r) + marks
		if lead {
			s = marks + string(r)
		}
		if !overflows(s) {
			break
		}
		count = rune(maxNonStarters + 1 - k)
	}
	return count
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

// vectorAlphabet mixes starters, starters with trailing non-starters, marks of
// several classes, multi-mark decompositions, Jamo and Indic vowels that
// combine backwards, a CGJ and "/". Vector inputs are letters indexing it.
var vectorAlphabet = []rune{
	'a', 'e', '/', 0x00E1, 0x01D6, 0x034F, 0x0B47, 0x1100, 0xAC00, 0xAC01, // starters
	0x0300, 0x0301, 0x0305, 0x0316, 0x0344, 0x0345, 0x0F73, 0x3099, // non-starters
	0x0B3E, 0x1161, 0x11A8, 0xFF9E, // combine backwards or compatibility marks
}

const vectorStarters = 10

type streamSafeVector struct {
	In     string `json:"in"`
	IsNFC  bool   `json:"isNfc"`
	NFD    string `json:"nfd"`
	NFC    string `json:"nfc"`
	Strict bool   `json:"nfcEqual"`
}

func shortHash(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:8])
}

// writeVectors prints differential vectors for the stream-safe NFC and NFD
// behaviour: deterministic inputs with long non-starter runs, each with
// norm.NFC.IsNormalString and short hashes of NFD.String and NFC.String.
func writeVectors() {
	rng := rand.New(rand.NewSource(15))
	letter := func(i int) byte { return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i] }
	var out struct {
		Alphabet []rune            `json:"alphabet"`
		Cases    []streamSafeVector `json:"cases"`
	}
	out.Alphabet = vectorAlphabet
	for n := 0; n < 800; n++ {
		var in []byte
		if n%2 == 1 {
			// Canonically ordered runs (U+0316 then U+0305) around the 30 limit,
			// so the NFC verdict turns on the run length alone.
			for seg := rng.Intn(2) + 1; seg > 0; seg-- {
				in = append(in, letter(rng.Intn(vectorStarters)))
				low := rng.Intn(4)
				for k := 26 + rng.Intn(9); k > 0; k-- {
					if low > 0 {
						in = append(in, letter(13)) // U+0316
						low--
					} else {
						in = append(in, letter(12)) // U+0305
					}
				}
			}
		}
		for seg := rng.Intn(3) + 1; n%2 == 0 && seg > 0; seg-- {
			for k := rng.Intn(3); k > 0; k-- {
				in = append(in, letter(rng.Intn(len(vectorAlphabet))))
			}
			for k := 24 + rng.Intn(14); k > 0; k-- {
				i := vectorStarters + rng.Intn(len(vectorAlphabet)-vectorStarters)
				if rng.Intn(12) == 0 {
					i = rng.Intn(len(vectorAlphabet))
				}
				in = append(in, letter(i))
			}
		}
		var s strings.Builder
		for _, c := range in {
			s.WriteRune(vectorAlphabet[c-'A'])
		}
		str := s.String()
		out.Cases = append(out.Cases, streamSafeVector{
			In:     string(in),
			IsNFC:  norm.NFC.IsNormalString(str),
			NFD:    shortHash(norm.NFD.String(str)),
			NFC:    shortHash(norm.NFC.String(str)),
			Strict: norm.NFC.String(str) == str,
		})
	}
	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "-vectors" {
		writeVectors()
		return
	}
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
		if lead, trail := nonStarters(r, true), nonStarters(r, false); lead != 0 || trail != 0 {
			d.StreamSafe = append(d.StreamSafe, [3]rune{r, lead, trail})
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
