package main

import (
	"diary/internal/auth"
	"fmt"
	"golang.org/x/term"
	"os"
)

func main() {
	fmt.Fprint(os.Stderr, "Password: ")
	p, e := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Fprintln(os.Stderr)
	if e != nil || len(p) == 0 || len(p) > 1024 {
		fmt.Fprintln(os.Stderr, "Cannot read a valid password from terminal")
		os.Exit(1)
	}
	h, e := auth.HashPassword(string(p))
	clear(p)
	if e != nil {
		fmt.Fprintln(os.Stderr, "Password hashing failed")
		os.Exit(1)
	}
	fmt.Println(h)
}
